import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, Modality, LiveServerMessage, StartSensitivity } from "@google/genai";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { WebSocketServer } from "ws";
import {
  buildBriefAnalysisPrompt,
  buildChatSystemInstruction,
  buildTunedChatSystemInstruction,
  buildVoiceSystemInstruction,
  formatProfileContext
} from "./server/mentorPrompt";

dotenv.config({ path: ['.env.local', '.env'] });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set payload limit higher to handle PDF uploads in Base64
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // Initialize Gemini client on the server
  // Note: user-agent telemetry is required for platform tracking
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // === Tuned Socratic model (Vertex AI) ===
  // When TUNED_CHAT_MODEL is set in .env.local (the tuned model endpoint produced by
  // training-data/train.sh), /api/chat calls it once instead of running the best-of-5
  // grading loop. Auth uses GOOGLE_APPLICATION_CREDENTIALS — the service account needs
  // the "Vertex AI User" role. If the call fails, we fall back to the grading loop.
  const TUNED_CHAT_MODEL = process.env.TUNED_CHAT_MODEL || "";
  let vertexAi: GoogleGenAI | null = null;
  if (TUNED_CHAT_MODEL) {
    try {
      vertexAi = new GoogleGenAI({
        vertexai: true,
        project: process.env.VERTEX_PROJECT || "briefer-502219",
        location: process.env.VERTEX_LOCATION || "us-central1"
      });
      console.log(`[Tuned] Vertex AI enabled — /api/chat uses tuned model: ${TUNED_CHAT_MODEL}`);
    } catch (e) {
      console.error("[Tuned] Failed to init Vertex client, using grading loop instead:", e);
      vertexAi = null;
    }
  }

  // Google Cloud TTS for real Hebrew (he-IL) voices. Enabled when service-account
  // credentials are provided via GOOGLE_APPLICATION_CREDENTIALS in .env.local.
  let ttsClient: TextToSpeechClient | null = null;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      ttsClient = new TextToSpeechClient();
      console.log(`[TTS] Google Cloud TTS enabled (credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS})`);
    } catch (e) {
      console.error("[TTS] Failed to init Google Cloud TTS client:", e);
    }
  } else {
    console.log("[TTS] No GOOGLE_APPLICATION_CREDENTIALS set — Hebrew Cloud TTS voices disabled, using Gemini voices.");
  }

  // === Self-distillation logging for fine-tuning ===
  // Every winning Socratic reply that scores >= DISTILL_MIN_SCORE is appended (in
  // Vertex AI supervised-tuning JSONL format) to training-data/distilled.jsonl at the
  // repo root. Over time this accumulates real, high-quality Hebrew training pairs that
  // can be merged with the curated dataset in ../training-data for the next tuning round.
  const DISTILL_MIN_SCORE = 85;
  const DISTILL_PATH = path.resolve(process.cwd(), "..", "training-data", "distilled.jsonl");
  const DISTILL_SYS = "אתה מנטור סוקרטי אישי, חם ואמפתי, המלווה סטודנט בעבודה על מטלה. " +
    "כללים מחייבים: לעולם אל תיתן פתרון מוכן, תוכן מוגמר או רשימת אפשרויות לבחירה - תפקידך להוביל את הסטודנט לגלות בעצמו. " +
    "שאל שאלה מרכזית אחת בלבד בכל תור. אל תמציא עובדות, שמות או דרישות. " +
    "שמור על טון קצר, טבעי, תומך ואנושי, כמו בשיחה קולית. השב בעברית בלבד.";

  function logDistilledPair(messages: any[], briefContext: any, reply: string, score: number) {
    try {
      // Keep the last 6 turns; training contents must start with user and alternate.
      const turns = messages.slice(-6).map((m: any) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: String(m.content || "") }]
      })).filter(t => t.parts[0].text.trim().length > 0);
      while (turns.length && turns[0].role !== "user") turns.shift();
      if (!turns.length || turns[turns.length - 1].role !== "user") return;
      for (let i = 1; i < turns.length; i++) {
        if (turns[i].role === turns[i - 1].role) return; // skip non-alternating snippets
      }
      const sysText = DISTILL_SYS + "\nהקשר המטלה הנוכחית: " + (briefContext?.assignmentName || "מטלה כללית");
      const row = {
        systemInstruction: { role: "system", parts: [{ text: sysText }] },
        contents: [...turns, { role: "model", parts: [{ text: reply }] }],
        _meta: { score, loggedAt: new Date().toISOString() }
      };
      fs.mkdirSync(path.dirname(DISTILL_PATH), { recursive: true });
      fs.appendFile(DISTILL_PATH, JSON.stringify(row) + "\n", err => {
        if (err) console.error("[Distill] Failed appending training pair:", err.message);
      });
    } catch (e: any) {
      console.error("[Distill] Logging error (non-fatal):", e.message);
    }
  }

  // Helper to carry out generateContent calls with robust retry-on-503/429 and model fallback logic
  async function generateContentWithRetry(params: {
    model: string;
    contents: any[];
    config?: any;
  }) {
    const modelsToTry = [params.model, "gemini-3.1-flash-lite"];
    let lastError: any = null;

    for (let m = 0; m < modelsToTry.length; m++) {
      const currentModel = modelsToTry[m];
      let attempts = 3;
      let delay = 1000;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          console.log(`[Gemini API] Call attempt ${attempt}/${attempts} using model ${currentModel}...`);
          const response = await ai.models.generateContent({
            ...params,
            model: currentModel
          });
          console.log(`[Gemini API] Call succeeded on attempt ${attempt} with model ${currentModel}!`);
          return response;
        } catch (error: any) {
          lastError = error;
          const status = error.status || "";
          const message = error.message || "";
          const code = error.code || 0;

          const isRetryable =
            status === "UNAVAILABLE" ||
            code === 503 ||
            message.includes("503") ||
            message.includes("UNAVAILABLE") ||
            message.includes("high demand") ||
            message.includes("temporary") ||
            message.includes("rate limit") ||
            message.includes("ResourceExhausted") ||
            code === 429;

          if (isRetryable && attempt < attempts) {
            console.warn(`[Gemini API] Attempt ${attempt} failed with status: ${status}, message: "${message}". Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // exponential backoff
          } else {
            console.error(`[Gemini API] Attempt ${attempt} failed with non-retryable error or ran out of attempts for model ${currentModel}:`, message);
            break; // Break the attempt loop to try the fallback model
          }
        }
      }
    }
    throw lastError || new Error("Failed to generate content after retry and model fallback.");
  }

  // 1. Analyze PDF Assignment Brief using inline Gemini Native PDF understanding
  app.post("/api/analyze-brief", async (req, res) => {
    console.log("POST /api/analyze-brief: Started parsing request...");
    try {
      const { pdfBase64, originalFileName } = req.body;
      if (!pdfBase64) {
        console.warn("POST /api/analyze-brief: Missing pdfBase64 content in payload");
        return res.status(400).json({ error: "Missing PDF file content" });
      }

      console.log(`POST /api/analyze-brief: Received file: ${originalFileName || "unknown"}, base64 length: ${pdfBase64.length}`);

      if (!process.env.GEMINI_API_KEY) {
        console.error("POST /api/analyze-brief: GEMINI_API_KEY is not configured in environment variables");
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured in environment variables" });
      }

      console.log("POST /api/analyze-brief: Sending request to Gemini Native API with multimodal inlineData...");

      const response = await generateContentWithRetry({
        model: "gemini-3.1-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: pdfBase64,
                  mimeType: "application/pdf"
                }
              },
              {
                text: buildBriefAnalysisPrompt()
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          // Extraction task — skip extended thinking for a much faster response
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assignmentName: { type: Type.STRING, description: "שם המטלה בעברית" },
              courseName: { type: Type.STRING, description: "שם הקורס או תחום הלימוד בעברית" },
              deadline: { type: Type.STRING, description: "תאריך הגשה, לוח זמנים מוגדר, או הערכת משך עבודה" },
              goals: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "מטרות ויעדים לימודיים מרכזיים של המטלה"
              },
              assignmentRules: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "חוקים קריטיים, אילוצים ודרישות קשיחות שחובה לעמוד בהן בבריף (למשל סוג דפוס, חוקי פורמט)"
              },
              immediatePracticalStep: {
                type: Type.STRING,
                description: "הצעד הפרקטי הראשון המיידי שעל הסטודנט לבצע או לבחור לפני שמתחילים לחשוב על קונספט"
              },
              requirements: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "דרישות הגשה קשיחות ופורמטים שחובה לייצר"
              },
              constraints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "מגבלות, איסורים, היקפי מילים או נקודות קריטיות לשים אליהן לב"
              },
              suggestedSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "שם קצר מאוד לשלב העבודה - 2 עד 4 מילים לכל היותר" },
                    description: { type: Type.STRING, description: "פעולות מומלצות ושאלות מפתח לחשיבה עצמית בשלב זה" },
                    phase: { type: Type.STRING, description: "סיווג השלב: research, ideation, planning, execution, review" },
                    weight: { type: Type.STRING, description: "משקל השלב בפרויקט: 'core' לשלב יצירתי/רעיוני מהותי שדורש חשיבה עמוקה, 'support' לשלב פרקטי/לוגיסטי/טכני (גיוס משתתפים, צילום, הדפסה, הגשה)" }
                  },
                  required: ["title", "description", "phase", "weight"]
                },
                description: "פירוק מתווה העבודה לשלבים מדורגים על מנת לעשות סדר לסטודנט"
              },
              deepResearchInsights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "מערך של תובנות מחקר מעמיקות במדע/תיאוריה/פרקטיקה של תחום המטלה, המציגות השלכות קריטיות, עקרונות תכנוניים או עיצוביים מדורגים"
              }
            },
            required: ["assignmentName", "courseName", "deadline", "goals", "assignmentRules", "immediatePracticalStep", "requirements", "constraints", "suggestedSteps", "deepResearchInsights"]
          }
        }
      });

      if (!response.text) {
        console.error("POST /api/analyze-brief: Empty text returned from Gemini API response");
        throw new Error("Empty response from Gemini API");
      }

      console.log("POST /api/analyze-brief: Gemini responded successfully. Parsing output JSON...");
      const analyzedData = JSON.parse(response.text.trim());
      console.log("POST /api/analyze-brief: Parsing succeeded. Returning brief to client:", analyzedData.assignmentName);
      res.json(analyzedData);

    } catch (error: any) {
      console.error("POST /api/analyze-brief: ERROR during brief analysis:", error);
      res.status(500).json({ error: error.message || "נכשלה אנליזת הקובץ" });
    }
  });

  // 2. Chat with Socratic Advisor using accumulated dialogue context and brief summary
  app.post("/api/chat", async (req, res) => {
    console.log("POST /api/chat: Started processing response generation...");
    try {
      const { messages, briefContext, currentPhase, checklist, scratchpad, profile } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Missing or invalid messages array" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
      }

      const activePhaseLabel = currentPhase || "research";

      const systemInstruction = buildChatSystemInstruction({
        briefContext,
        checklist,
        scratchpad,
        profile
      });

      // Convert messages to Gemini SDK format
      const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      // JSON Response Schema for Multi-Candidate Selection and Grading
      const chatResponseSchema = {
        type: Type.OBJECT,
        properties: {
          userMoodAnalysis: { type: Type.STRING, description: "ניתוח קצר של מצב המשתמש הנוכחי (לחוץ, אבוד, בטוח, בפלואו)" },
          currentPhaseAnalysis: { type: Type.STRING, description: "ניתוח הדרכים למיצוי השלב הנוכחי" },
          candidates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "מזהה ייחודי בין 1 ל-5" },
                text: { type: Type.STRING, description: "תוכן התשובה האנושית והמלאה בעברית מרהיבה. זכור: לעולם אין להציג רשימת אופציות לבחירה!" },
                metrics: {
                  type: Type.OBJECT,
                  properties: {
                    empathy: { type: Type.INTEGER, description: "ציון 1-10 על תמיכה, הכלה והבנת המשתמש" },
                    briefRelevance: { type: Type.INTEGER, description: "ציון 1-10 על רלוונטיות לחוקי בריף המטלה ותרומה להבנתו" },
                    phaseRelevance: { type: Type.INTEGER, description: "ציון 1-10 על רלוונטיות קפדנית לשלב הנוכחי ומניעת קפיצה קדימה" },
                    userStateCalibration: { type: Type.INTEGER, description: "ציון 1-10 על התאמה מדויקת למצב הרגשי (הרגעה, עידוד, אתגור)" },
                    novelty: { type: Type.INTEGER, description: "ציון 1-10 המציג כמה התשובה מקורית, מגוונת ואינה חוזרת על שאלות או ניסוחים קודמים בשיחה" },
                    socraticPedagogy: { type: Type.INTEGER, description: "ציון 1-10 על שמירת כללים סוקרטיים - הימנעות ממתן תשובה ישירה ושאילת שאלת הכוונה מעולה" }
                  },
                  required: ["empathy", "briefRelevance", "phaseRelevance", "userStateCalibration", "novelty", "socraticPedagogy"]
                },
                metricExplanations: {
                  type: Type.OBJECT,
                  properties: {
                    empathy: { type: Type.STRING, description: "הסבר הציון" },
                    briefRelevance: { type: Type.STRING, description: "הסבר הציון" },
                    phaseRelevance: { type: Type.STRING, description: "הסבר הציון" },
                    userStateCalibration: { type: Type.STRING, description: "הסבר הציון" },
                    novelty: { type: Type.STRING, description: "הסבר הציון" },
                    socraticPedagogy: { type: Type.STRING, description: "הסבר הציון" }
                  },
                  required: ["empathy", "briefRelevance", "phaseRelevance", "userStateCalibration", "novelty", "socraticPedagogy"]
                },
                totalScore: { type: Type.INTEGER, description: "ציון כולל משוקלל סופי בין 0 ל-100 על פדגוגיה, עומק ואי-הקדמה" }
              },
              required: ["id", "text", "metrics", "metricExplanations", "totalScore"]
            }
          },
          winningCandidateId: { type: Type.INTEGER, description: "ה-ID של המועמד שקיבל את הציון הגבוה ביותר (בין 1 ל-5)" },
          completedStepTitles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של כותרות מדויקות (title) של שלבים ממפת הדרכים שהושלמו בהצלחה (לאחר שהמשתמש אישר בוודאות!). אם אין, יוחזר מערך ריק []"
          },
          skippedStepTitles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של כותרות מדויקות של שלבים שהמשתמש ביקש לדלג עליהם כעת (יש לזכור לחזור אליהם בהמשך). אם אין, מערך ריק []"
          },
          updatedScratchpadText: {
            type: Type.STRING,
            description: "הטקסט המלא שיופיע בפנקס הרעיונות (הטקסט יחליף את הפנקס הקיים, אם רוצים להוסיף - יש לשרשר לטקסט הקיים). השאר את זה עם הערך הקיים במקרה שאין צורך לעדכן."
          },
          userProfileUpdates: {
            type: Type.OBJECT,
            description: "תובנות חדשות על הסטודנט לפרופיל הלמידה המצטבר. השאר שדות ריקים אם אין תובנה חדשה.",
            properties: {
              guidanceStyle: { type: Type.STRING, description: "סגנון הנחיה שעובד טוב לסטודנט הזה (או ריק)" },
              pace: { type: Type.STRING, description: "קצב העבודה והחשיבה של הסטודנט (או ריק)" },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "חוזקות שזוהו בשיחה (או ריק)" },
              struggles: { type: Type.ARRAY, items: { type: Type.STRING }, description: "קשיים חוזרים שזוהו (או ריק)" },
              vocabulary: { type: Type.ARRAY, items: { type: Type.STRING }, description: "מילים ודימויים אישיים שהסטודנט משתמש בהם (או ריק)" }
            },
            required: ["guidanceStyle", "pace", "strengths", "struggles", "vocabulary"]
          }
        },
        required: ["userMoodAnalysis", "currentPhaseAnalysis", "candidates", "winningCandidateId", "completedStepTitles", "skippedStepTitles", "updatedScratchpadText", "userProfileUpdates"]
      };

      console.log(`POST /api/chat: Sending content to Gemini with phase: ${activePhaseLabel}`);

      // Fast path: tuned Socratic model. One generation call for the reply, plus a
      // parallel flash-lite pass for the structured metadata (steps/scratchpad/profile)
      // the frontend expects. Any failure falls through to the grading loop below.
      if (vertexAi && TUNED_CHAT_MODEL) {
        const { candidates: _cand, winningCandidateId: _win, ...metaProps } = chatResponseSchema.properties as any;
        const chatMetadataSchema = {
          type: Type.OBJECT,
          properties: metaProps,
          required: ["userMoodAnalysis", "currentPhaseAnalysis", "completedStepTitles", "skippedStepTitles", "updatedScratchpadText", "userProfileUpdates"]
        };
        try {
          const [replyResp, metaResp] = await Promise.all([
            vertexAi.models.generateContent({
              model: TUNED_CHAT_MODEL,
              contents,
              config: {
                systemInstruction: buildTunedChatSystemInstruction({ briefContext, checklist, scratchpad, profile }),
                temperature: 0.85
              }
            }),
            generateContentWithRetry({
              model: "gemini-3.1-flash-lite",
              contents,
              config: {
                systemInstruction,
                temperature: 0.2,
                responseMimeType: "application/json",
                responseSchema: chatMetadataSchema
              }
            }).catch((e: any) => {
              console.warn("[Tuned] Metadata pass failed (non-fatal):", e.message);
              return null;
            })
          ]);
          const tunedReply = (replyResp.text || "").trim();
          if (tunedReply) {
            let meta: any = {};
            try { meta = metaResp?.text ? JSON.parse(metaResp.text.trim()) : {}; } catch { /* metadata optional */ }
            console.log("POST /api/chat: Tuned model reply. Text teaser:", tunedReply.substring(0, 40));
            return res.json({
              content: tunedReply,
              userMoodAnalysis: meta.userMoodAnalysis || "רגיל",
              currentPhaseAnalysis: meta.currentPhaseAnalysis || "רגיל",
              candidates: [],
              winningCandidateId: 1,
              completedStepTitles: meta.completedStepTitles || [],
              skippedStepTitles: meta.skippedStepTitles || [],
              updatedScratchpadText: meta.updatedScratchpadText,
              userProfileUpdates: meta.userProfileUpdates || null
            });
          }
          console.warn("[Tuned] Empty reply from tuned model — falling back to grading loop");
        } catch (e: any) {
          console.error("[Tuned] Tuned model call failed — falling back to grading loop:", e.message);
        }
      }

      let finalDecisionData: any = null;
      let winningCandidate: any = null;
      let candidatesList: any[] = [];
      let iterations = 0;
      const maxIterations = 3;
      let usedInstruction = systemInstruction;

      while (iterations < maxIterations) {
        iterations++;
        console.log(`[POST /api/chat] Socratic mentor generation attempt ${iterations}/${maxIterations}`);

        const response = await generateContentWithRetry({
          model: "gemini-3.5-flash",
          contents: contents,
          config: {
            systemInstruction: usedInstruction,
            temperature: 0.85 + (iterations - 1) * 0.05, // slightly increase variety
            responseMimeType: "application/json",
            responseSchema: chatResponseSchema
          }
        });

        if (!response.text) {
          throw new Error("Returned empty response from Gemini decision engine");
        }

        try {
          const decisionData = JSON.parse(response.text.trim());
          const list = decisionData.candidates || [];

          // Look for any candidate with a totalScore >= 70
          const qualified = list.filter((c: any) => typeof c.totalScore === 'number' && c.totalScore >= 70);

          if (qualified.length > 0) {
            finalDecisionData = decisionData;
            candidatesList = list;
            // Pick highest scoring of qualified
            winningCandidate = qualified.slice().sort((a: any, b: any) => b.totalScore - a.totalScore)[0];
            console.log(`[POST /api/chat] Iteration ${iterations} succeeded! Qualified winning candidate ID: ${winningCandidate.id} with score: ${winningCandidate.totalScore}`);
            break;
          } else {
            console.log(`[POST /api/chat] Iteration ${iterations} failed to produce any candidate with score >= 70. Highest score in this batch: ${list.length > 0 ? Math.max(...list.map((c: any) => c.totalScore || 0)) : 0}`);

            // Track the best attempt so far
            if (!finalDecisionData || (list.length > 0 && Math.max(...list.map((c: any) => c.totalScore || 0)) > Math.max(...(finalDecisionData.candidates || []).map((c: any) => c.totalScore || 0)))) {
              finalDecisionData = decisionData;
              candidatesList = list;
            }

            // Adjust the instruction to explicitly demand higher grades and stricter adherence
            usedInstruction = systemInstruction + `\n\n=== דרישה קריטית דחופה של מנטור לשיפור (ניסיון מספר ${iterations + 1}) ===\nבניסיון הקודם, אף אחת מהתשובות שלך לא עברה את ציון הסף הדרוש של 70! רוב התשובות היו פשטניות מדי, מכניות מדי, או שלא שילבו מספיק לעומק את תובנות המחקר המעמיק ואמפתיה חמה בתוך השאלות הסוקרטיות.\n\nאנא בצע אופטימיזציה דחופה של 5 התשובות שלך:\n1. הקפד על טון אנושי וקשוב, שחורג לחלוטין מכניסות משעממות של בוט ומנסח את הדברים בצורה שמזמינה שיחה קולית זורמת, מעצימה ומכילה.\n2. העמק מאוד בשיח הסוקרטי והרגשי - עזור לסטודנט לגלות את הרעיונות שלו באהבה, ברגישות ובצורה תומכת, לצד שילוב תובנות מחקר קריטיות.\n3. הענק להם ציונים ריאליים ופדגוגיים מתוך 100 בקריטריון ה-totalScore. כוון כך שלפחות תשובה אחת תקבל ציון של לפחות 70 (למשל 80 ועד 95) בזכות איכותה, עומקה והטון האנושי המופלא שלה!`;
          }
        } catch (parseError) {
          console.error(`[POST /api/chat] Error parsing JSON output of attempt ${iterations}`, parseError);
          if (iterations === maxIterations) {
            throw parseError;
          }
        }
      }

      // If loop finished and we select winningCandidate from our preserved best-scoring candidate
      if (!winningCandidate && candidatesList.length > 0) {
        // Fallback: pick highest totalScore overall
        winningCandidate = candidatesList.slice().sort((a: any, b: any) => (b.totalScore || 0) - (a.totalScore || 0))[0];
        console.log(`[POST /api/chat] Falling back to best available candidate of score ${winningCandidate?.totalScore}`);
      }

      const finalReply = winningCandidate ? winningCandidate.text : "סליחה, לא הצלחתי לעבד את התשובה כעת באורח תקין.";
      const finalWinningId = winningCandidate ? winningCandidate.id : (finalDecisionData?.winningCandidateId || 1);

      console.log("POST /api/chat: Winner selected:", finalWinningId, "Text teaser:", finalReply.substring(0, 40));

      // Self-distillation: persist high-scoring winning replies as future fine-tuning data
      if (winningCandidate && typeof winningCandidate.totalScore === "number" && winningCandidate.totalScore >= DISTILL_MIN_SCORE) {
        logDistilledPair(messages, briefContext, finalReply, winningCandidate.totalScore);
      }

      res.json({
        content: finalReply,
        userMoodAnalysis: finalDecisionData?.userMoodAnalysis || "רגיל",
        currentPhaseAnalysis: finalDecisionData?.currentPhaseAnalysis || "רגיל",
        candidates: candidatesList,
        winningCandidateId: finalWinningId,
        completedStepTitles: finalDecisionData?.completedStepTitles || [],
        skippedStepTitles: finalDecisionData?.skippedStepTitles || [],
        updatedScratchpadText: finalDecisionData?.updatedScratchpadText,
        userProfileUpdates: finalDecisionData?.userProfileUpdates || null
      });

    } catch (error: any) {
      console.error("Error in chat AI endpoint:", error);
      res.status(500).json({ error: error.message || "שגיאה זמנית בעיבוד התשובה בשרת ה-AI" });
    }
  });

  // 3. Voice configuration: curated Hebrew voices (Chirp3-HD — Google's most natural generation)
  const CURATED_HEBREW_VOICES = [
    { name: "he-IL-Chirp3-HD-Aoede", gender: "FEMALE", label: "נועה — נשי, חם וטבעי" },
    { name: "he-IL-Chirp3-HD-Sulafat", gender: "FEMALE", label: "שירה — נשי, רגוע ובטוח" },
    { name: "he-IL-Chirp3-HD-Leda", gender: "FEMALE", label: "מאיה — נשי, צעיר ואנרגטי" },
    { name: "he-IL-Chirp3-HD-Charon", gender: "MALE", label: "יואב — גברי, עמוק ורגוע" },
    { name: "he-IL-Chirp3-HD-Puck", gender: "MALE", label: "עידו — גברי, קליל ואופטימי" },
    { name: "he-IL-Chirp3-HD-Orus", gender: "MALE", label: "דניאל — גברי, יציב וסמכותי" }
  ];

  app.get("/api/voice-config", async (_req, res) => {
    if (!ttsClient) {
      return res.json({ hebrewTts: false, voices: [] });
    }
    try {
      const [resp] = await ttsClient.listVoices({ languageCode: "he-IL" });
      const available = new Set((resp.voices || []).map(v => v.name));
      const voices = CURATED_HEBREW_VOICES.filter(v => available.has(v.name));
      res.json({ hebrewTts: voices.length > 0, voices });
    } catch (e: any) {
      console.error("[TTS] listVoices failed:", e.message);
      res.json({ hebrewTts: false, voices: [] });
    }
  });

  // Serve Vite application or Build bundle in production
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode with static folder serving...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running successfully on port ${PORT}`);
  });

  // Tools the live voice mentor can invoke (client executes them against local state).
  // Every description reiterates the explicit-consent rule.
  const voiceToolDeclarations = [
    {
      name: "add_note",
      description: "הוספת פתק חדש (רעיון, תובנה, רפרנס) לפנקס של הסטודנט. יש להפעיל רק לאחר שהסטודנט אישר במפורש בשיחה שהוא רוצה לשמור את הפתק.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "כותרת קצרה וקולעת לפתק בעברית" },
          content: { type: Type.STRING, description: "תוכן הפתק המלא בעברית" }
        },
        required: ["title", "content"]
      }
    },
    {
      name: "update_note",
      description: "עדכון פתק קיים של הסטודנט לפי המזהה שלו (noteId מרשימת הפתקים שבהקשר). יש להפעיל רק לאחר אישור מפורש של הסטודנט.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          noteId: { type: Type.STRING, description: "מזהה הפתק לעדכון" },
          title: { type: Type.STRING, description: "כותרת חדשה (אופציונלי)" },
          content: { type: Type.STRING, description: "תוכן חדש שיחליף את הקיים (אופציונלי)" }
        },
        required: ["noteId"]
      }
    },
    {
      name: "delete_note",
      description: "מחיקת פתק של הסטודנט לפי המזהה שלו. יש להפעיל רק לאחר אישור מפורש וחד-משמעי של הסטודנט למחיקה.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          noteId: { type: Type.STRING, description: "מזהה הפתק למחיקה" }
        },
        required: ["noteId"]
      }
    },
    {
      name: "complete_step",
      description: "סימון שלב במפת הדרכים כהושלם. יש להפעיל אך ורק לאחר שסיכמתם את השלב והסטודנט אישר במפורש ('כן', 'אפשר לסמן') שסיים אותו.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepTitle: { type: Type.STRING, description: "הכותרת המדויקת של השלב ממפת הדרכים" }
        },
        required: ["stepTitle"]
      }
    },
    {
      name: "reopen_step",
      description: "פתיחה מחדש של שלב שסומן כהושלם במפת הדרכים (ביטול הסימון). יש להפעיל רק לאחר אישור מפורש של הסטודנט.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepTitle: { type: Type.STRING, description: "הכותרת המדויקת של השלב ממפת הדרכים" }
        },
        required: ["stepTitle"]
      }
    },
    {
      name: "add_step",
      description: "הוספת שלב/תחנה חדשה למפת הדרכים של המטלה. יש להפעיל רק לאחר שהסטודנט אישר במפורש שהוא רוצה להוסיף את השלב.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "שם קצר מאוד לשלב החדש בעברית - 2 עד 4 מילים לכל היותר" },
          description: { type: Type.STRING, description: "תיאור קצר של השלב" },
          phase: { type: Type.STRING, description: "סיווג השלב: research, ideation, planning, execution, review" }
        },
        required: ["title", "description", "phase"]
      }
    },
    {
      name: "skip_step",
      description: "סימון שלב במפת הדרכים כ'דילוג' לבקשת הסטודנט. ההתקדמות עוברת לשלב הבא, אך יש לזכור לחזור לשלב הזה בנקודה ההגיונית ביותר בהמשך. יש להפעיל כשהסטודנט ביקש לדלג ואישר.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepTitle: { type: Type.STRING, description: "הכותרת המדויקת של השלב שמדלגים עליו" }
        },
        required: ["stepTitle"]
      }
    },
    {
      name: "update_step",
      description: "עריכת שלב קיים במפת הדרכים (שם, תיאור או סיווג) לפי בקשת הסטודנט. יש להפעיל רק לאחר שהסטודנט אישר את השינוי.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepTitle: { type: Type.STRING, description: "הכותרת הנוכחית המדויקת של השלב לעריכה" },
          newTitle: { type: Type.STRING, description: "שם חדש לשלב (אופציונלי)" },
          newDescription: { type: Type.STRING, description: "תיאור חדש (אופציונלי)" },
          newPhase: { type: Type.STRING, description: "סיווג חדש: research, ideation, planning, execution, review (אופציונלי)" }
        },
        required: ["stepTitle"]
      }
    },
    {
      name: "delete_step",
      description: "מחיקת שלב ממפת הדרכים לבקשת הסטודנט. יש להפעיל רק לאחר אישור מפורש וחד-משמעי שלו.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          stepTitle: { type: Type.STRING, description: "הכותרת המדויקת של השלב למחיקה" }
        },
        required: ["stepTitle"]
      }
    },
    {
      name: "replace_roadmap",
      description: "החלפת מפת הדרכים כולה ברשימת שלבים חדשה שסוכמה עם הסטודנט (סדר חדש, מיזוגים, ניסוחים). שלבים עם אותה כותרת שומרים על מצב ההשלמה שלהם. יש להפעיל רק לאחר שהסטודנט אישר את המפה החדשה במפורש.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          steps: {
            type: Type.ARRAY,
            description: "רשימת השלבים החדשה, לפי הסדר",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "שם השלב - קצר מאוד, 2 עד 4 מילים" },
                description: { type: Type.STRING, description: "תיאור קצר" },
                phase: { type: Type.STRING, description: "research, ideation, planning, execution, review" }
              },
              required: ["title", "description", "phase"]
            }
          }
        },
        required: ["steps"]
      }
    }
  ];

  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", (clientWs, req) => {
    console.log("WebSocket client connected to /live");
    // Parse voice from URL query
    let voiceName = "Zephyr";
    if (req.url && req.url.includes("?")) {
      const qs = new URLSearchParams(req.url.split("?")[1]);
      if (qs.get("voice")) {
        voiceName = qs.get("voice") as string;
      }
    }

    let session: any = null;
    let audioChunkCount = 0;

    // Watchdog: if the user finished a turn and the model stays silent (turn-taking
    // desync), nudge it to answer instead of leaving the student hanging.
    let lastUserActivity = 0;
    let lastModelActivity = 0;
    let toolPending = false;
    let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNudge = () => {
      if (nudgeTimer) clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => {
        if (session && !toolPending && lastUserActivity > lastModelActivity && clientWs.readyState === 1) {
          console.log("[Live] Watchdog: model silent after user turn — nudging it to answer");
          try {
            session.sendClientContent({
              turns: [{
                role: "user",
                parts: [{ text: "(הודעת מערכת: הסטודנט סיים לדבר והוא ממתין לתשובתך — ענה לו עכשיו, בקול, על מה שאמר. אם לא שמעת או לא הבנת את דבריו — אל תנחש: אמור לו שלא קלטת ובקש שיחזור.)" }]
              }],
              turnComplete: true
            });
          } catch (e) {
            console.error("[Live] Watchdog nudge failed:", e);
          }
        }
      }, 5000);
    };

    // --- Accurate user bubbles: the Live API's own input transcription is a separate
    // ASR pass that often mislabels Hebrew. We buffer the user's mic audio and, when
    // the model starts answering (= turn ended), transcribe it properly with Gemini
    // and send that as the authoritative transcript.
    let pendingUserAudio: Buffer[] = [];
    let pendingUserBytes = 0;
    let modelTurnOpen = false;
    let currentMentorUtterance = "";
    let lastMentorUtterance = "";
    const MAX_PENDING_BYTES = 16000 * 2 * 120; // cap at ~120s of 16kHz PCM
    const MIN_SPEECH_BYTES = 16000 * 2 * 0.5;  // ignore buffers under ~0.5s

    // Trim leading/trailing silence (with padding) so the transcriber gets speech, not dead air
    const trimSilence = (pcm: Buffer, sampleRate = 16000): Buffer => {
      const win = Math.floor(sampleRate * 0.03) * 2; // 30ms windows (bytes)
      const thresh = 500; // int16 RMS threshold
      let first = -1, last = -1;
      for (let off = 0; off + win <= pcm.length; off += win) {
        let sum = 0;
        for (let i = 0; i < win; i += 8) {
          const v = pcm.readInt16LE(off + i);
          sum += v * v;
        }
        const rms = Math.sqrt(sum / (win / 8));
        if (rms > thresh) {
          if (first === -1) first = off;
          last = off + win;
        }
      }
      if (first === -1) return Buffer.alloc(0); // pure silence
      const pad = Math.floor(sampleRate * 0.25) * 2; // 250ms padding
      const start = Math.max(0, first - pad);
      const end = Math.min(pcm.length, last + pad);
      return pcm.subarray(start, end);
    };

    const wavFromPcm = (pcm: Buffer, sampleRate = 16000): Buffer => {
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + pcm.length, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);       // PCM
      header.writeUInt16LE(1, 22);       // mono
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write("data", 36);
      header.writeUInt32LE(pcm.length, 40);
      return Buffer.concat([header, pcm]);
    };

    const flushUserTranscription = () => {
      if (pendingUserBytes < MIN_SPEECH_BYTES) {
        pendingUserAudio = [];
        pendingUserBytes = 0;
        return;
      }
      const raw = Buffer.concat(pendingUserAudio);
      pendingUserAudio = [];
      pendingUserBytes = 0;
      const snapshot = trimSilence(raw);
      if (snapshot.length < MIN_SPEECH_BYTES / 2) {
        // Nothing voice-like in the buffer — tell the client to drop any pending bubble
        if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ userTranscriptEmpty: true }));
        return;
      }

      (async () => {
        try {
          const wav = wavFromPcm(snapshot);
          const mentorCtx = lastMentorUtterance
            ? `לצורך הקשר בלבד, אלו היו המילים האחרונות של המנטור שאליהן הסטודנט מגיב: "${lastMentorUtterance.slice(-260)}".\n`
            : "";
          const response = await generateContentWithRetry({
            model: "gemini-3.1-flash-lite",
            contents: [{
              role: "user",
              parts: [
                { inlineData: { data: wav.toString("base64"), mimeType: "audio/wav" } },
                { text: `לפניך הקלטה של סטודנט ישראלי המדבר עברית בשיחה קולית עם מנטור לעיצוב. ${mentorCtx}ההקלטה עשויה להכיל קטעי שקט - התעלם מהם ותמלל את הדיבור עצמו. תמלל את דיבור הסטודנט במדויק, בעברית (מילים לועזיות ייכתבו כפי שנאמרו). החזר אך ורק את מילות התמלול עצמן, בלי ניקוד, בלי הערות ובלי הסברים. אם אין דיבור ברור בהקלטה, החזר בדיוק: [שקט]` }
              ]
            }],
            config: { thinkingConfig: { thinkingBudget: 0 } }
          });
          const text = (response.text || "").trim();
          if (text && !text.includes("[שקט]") && clientWs.readyState === 1) {
            console.log("[Live] User turn transcribed:", text.slice(0, 80));
            clientWs.send(JSON.stringify({ userTranscript: text }));
          } else if (clientWs.readyState === 1) {
            console.log("[Live] User turn transcription empty/noise");
            clientWs.send(JSON.stringify({ userTranscriptEmpty: true }));
          }
        } catch (e: any) {
          console.error("[Live] User turn transcription failed:", e?.message);
        }
      })();
    };

    // --- Hebrew cascade mode: Gemini thinks in TEXT, Google Cloud TTS speaks he-IL ---
    // Active when a real Hebrew voice (he-IL-*) is selected and TTS credentials exist.
    const useHebrewTts = !!ttsClient && voiceName.startsWith("he-IL");
    let ttsGen = 0; // bumped to cancel queued speech on interruption
    let ttsChain: Promise<void> = Promise.resolve();
    let ttsBuffer = "";

    const enqueueTts = (text: string) => {
      const gen = ttsGen;
      ttsChain = ttsChain.then(async () => {
        if (gen !== ttsGen || !ttsClient) return;
        try {
          const [resp] = await ttsClient.synthesizeSpeech({
            input: { text },
            voice: { languageCode: "he-IL", name: voiceName },
            audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 }
          });
          if (gen !== ttsGen || clientWs.readyState !== 1) return;
          const audio = Buffer.from(resp.audioContent as Uint8Array);
          // LINEAR16 arrives as WAV; strip the 44-byte RIFF header, client plays raw PCM @24k
          clientWs.send(JSON.stringify({ audio: audio.subarray(44).toString("base64") }));
        } catch (e) {
          console.error("[TTS] Hebrew synthesis failed:", e);
        }
      });
    };

    const SENTENCE_RE = /[^.!?\n]+[.!?\n]+/g;
    const feedTts = (text: string) => {
      ttsBuffer += text;
      SENTENCE_RE.lastIndex = 0;
      let consumed = 0;
      let m: RegExpExecArray | null;
      while ((m = SENTENCE_RE.exec(ttsBuffer))) {
        const sentence = m[0].trim();
        if (sentence) enqueueTts(sentence);
        consumed = SENTENCE_RE.lastIndex;
      }
      if (consumed > 0) ttsBuffer = ttsBuffer.slice(consumed);
    };
    const flushTts = () => {
      const rest = ttsBuffer.trim();
      ttsBuffer = "";
      if (rest) enqueueTts(rest);
    };
    const cancelTts = () => {
      ttsGen++;
      ttsBuffer = "";
    };

    clientWs.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.setup) {
          const initialContext = msg.text || "";
          const profileContext = formatProfileContext(msg.profile || null);
          const kickoff = !!msg.kickoff;

          // Hebrew cascade: the live models only support AUDIO output, so we run a normal
          // audio session, discard Gemini's voice, and speak its output transcription
          // through Cloud TTS he-IL voices instead.
          // Otherwise native-audio first (natural prosody), half-cascade as fallback.
          const liveModelsToTry = useHebrewTts
            ? ["gemini-3.1-flash-live-preview"]
            : ["gemini-2.5-flash-native-audio-latest", "gemini-3.1-flash-live-preview"];

          const buildLiveConfig = (model: string) => ({
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                // In Hebrew-TTS mode Gemini's own voice is discarded; any valid name works
                prebuiltVoiceConfig: { voiceName: voiceName.startsWith("he-IL") ? "Zephyr" : voiceName }
              },
              ...(model.includes("native-audio") ? {} : { languageCode: "he-IL" })
            },
            // Latency: skip extended thinking and shorten end-of-speech detection.
            // 700ms is the middle ground — 400ms + high sensitivity caused the model
            // to jump in on natural pauses and occasionally deadlock the turn-taking.
            ...(model.includes("native-audio") ? {
              thinkingConfig: { thinkingBudget: 0 },
              realtimeInputConfig: {
                automaticActivityDetection: {
                  // Catch short utterances like "כן" / "לא" that default VAD misses
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                  silenceDurationMs: 700
                }
              }
            } : {}),
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{ functionDeclarations: voiceToolDeclarations }],
            systemInstruction: buildVoiceSystemInstruction({ initialContext, profileContext }),
          });

          try {
            let connectErr: any = null;
            for (const liveModel of liveModelsToTry) {
              try {
                console.log(`[Live] Connecting with model ${liveModel}...`);
                session = await ai.live.connect({
                  model: liveModel,
                  config: buildLiveConfig(liveModel),
                  callbacks: {
                onmessage: (message: LiveServerMessage) => {
                  const parts = message.serverContent?.modelTurn?.parts;
                  const hasModelAudio = !!parts?.some(p => p.inlineData?.data);

                  // Watchdog bookkeeping: user speech vs model responses.
                  // Also forward as a provisional bubble (instant, corrected later).
                  if (message.serverContent?.inputTranscription?.text) {
                    lastUserActivity = Date.now();
                    scheduleNudge();
                    clientWs.send(JSON.stringify({ provisionalUserTranscript: message.serverContent.inputTranscription.text }));
                  }
                  if (hasModelAudio || message.toolCall?.functionCalls) {
                    lastModelActivity = Date.now();
                    if (nudgeTimer) clearTimeout(nudgeTimer);
                  }

                  // Model started answering (audio or tool call) → the user's turn ended:
                  // transcribe what they actually said for an accurate chat bubble
                  if ((hasModelAudio || message.toolCall?.functionCalls) && !modelTurnOpen) {
                    modelTurnOpen = true;
                    flushUserTranscription();
                  }

                  if (parts) {
                    for (const part of parts) {
                      // Hebrew-TTS mode: Gemini's own audio is discarded (Cloud TTS speaks instead)
                      if (part.inlineData?.data && !useHebrewTts) {
                        clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                      }
                    }
                  }
                  if (message.serverContent?.outputTranscription?.text) {
                    const outText = message.serverContent.outputTranscription.text;
                    currentMentorUtterance += outText;
                    clientWs.send(JSON.stringify({ outputTranscript: outText }));
                    // Speak the mentor's words with the real Hebrew voice
                    if (useHebrewTts) feedTts(outText);
                  }
                  if (message.toolCall?.functionCalls) {
                    toolPending = true;
                    for (const fc of message.toolCall.functionCalls) {
                      console.log(`[Live] Tool call requested: ${fc.name}`, fc.args);
                      clientWs.send(JSON.stringify({ toolCall: { id: fc.id, name: fc.name, args: fc.args || {} } }));
                    }
                  }
                  if (message.serverContent?.interrupted) {
                    modelTurnOpen = false;
                    cancelTts();
                    clientWs.send(JSON.stringify({ interrupted: true }));
                  }
                  if (message.serverContent?.turnComplete) {
                    modelTurnOpen = false;
                    if (currentMentorUtterance.trim()) {
                      lastMentorUtterance = currentMentorUtterance;
                      currentMentorUtterance = "";
                    }
                    flushTts();
                    clientWs.send(JSON.stringify({ turnComplete: true }));
                  }
                },
                onerror: (e: any) => {
                  console.error("[Live] Session error:", e?.message || e);
                  // Tell the client and release it — otherwise the UI hangs in "connecting"
                  if (clientWs.readyState === 1) {
                    clientWs.send(JSON.stringify({ sessionError: e?.message || "השיחה נותקה" }));
                    clientWs.close();
                  }
                },
                onclose: (e: any) => {
                  console.log(`[Live] Session closed by server. Code: ${e?.code}, reason: ${e?.reason || "(none)"}`);
                  if (clientWs.readyState === 1) {
                    clientWs.close();
                  }
                },
                  }
                });
                console.log(`[Live] Connected successfully with ${liveModel}`);
                connectErr = null;
                break;
              } catch (e) {
                connectErr = e;
                console.error(`[Live] Failed to connect with ${liveModel}, trying next...`, e);
              }
            }
            if (!session) throw connectErr || new Error("No live model available");
            clientWs.send(JSON.stringify({ setupComplete: true }));

            // Fresh conversation: fire a hidden turn so the mentor SPEAKS FIRST
            // (live models only respond — without this they sit listening forever)
            if (kickoff) {
              console.log("[Live] Kickoff: prompting the mentor to open the conversation");
              session.sendClientContent({
                turns: [{
                  role: "user",
                  parts: [{ text: "(הודעת מערכת: הסטודנט הרגע נכנס לשיחה על בריף חדש. פתח אתה את השיחה עכשיו, בקול, לפי שלב א' של התסריט — הפתיחה הרציפה המלאה באותו תור אחד: ברכת שלום בשמו ושאלה לשלומו, ומיד באותה נשימה שראית את הבריף, התרשמותך הקצרה ממנו, והצעה לסכם אותו. רק אחרי כל זה עצור והמתן לתשובתו. אל תמתין לו שידבר קודם.)" }]
                }],
                turnComplete: true
              });
            }
          } catch (e) {
            console.error("Failed to start Live API session", e);
            clientWs.close();
          }
          return;
        }

        if (!session) return; // Wait if session isn't fully ready

        if (msg.audio) {
          audioChunkCount++;
          if (audioChunkCount === 1) console.log("[Live] First mic audio chunk received from client");
          if (audioChunkCount % 200 === 0) console.log(`[Live] ${audioChunkCount} mic chunks forwarded`);

          // Buffer the raw mic audio for accurate per-turn transcription
          const pcmChunk = Buffer.from(msg.audio, "base64");
          pendingUserAudio.push(pcmChunk);
          pendingUserBytes += pcmChunk.length;
          while (pendingUserBytes > MAX_PENDING_BYTES && pendingUserAudio.length > 1) {
            pendingUserBytes -= pendingUserAudio[0].length;
            pendingUserAudio.shift();
          }

          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }

        // Client-side end-of-speech: the browser heard the user finish talking.
        // Transcribe their turn NOW (so the bubble pops right away) and arm the watchdog.
        if (msg.userSpokeHint) {
          lastUserActivity = Date.now();
          scheduleNudge();
          flushUserTranscription();
        }

        if (msg.toolResponse) {
          toolPending = false;
          lastModelActivity = Date.now();
          console.log(`[Live] Tool response for ${msg.toolResponse.name}:`, msg.toolResponse.result);
          session.sendToolResponse({
            functionResponses: [{
              id: msg.toolResponse.id,
              name: msg.toolResponse.name,
              response: msg.toolResponse.result || { ok: true }
            }]
          });
        }
      } catch (e) {
        console.error("Error parsing WS message", e);
      }
    });

    clientWs.on("close", async () => {
      if (nudgeTimer) clearTimeout(nudgeTimer);
      console.log("WebSocket client disconnected");
      if (session) {
        try {
          await session.close();
          console.log("Gemini Live session closed successfully");
        } catch (err) {
          console.error("Error closing Gemini Live session:", err);
        }
        session = null;
      }
    });
  });
}

startServer().catch((err) => {
  console.error("Failed to start server on boot:", err);
});
