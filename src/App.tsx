/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X, Upload } from 'lucide-react';
import { IconChat } from './components/icons';
import { Project, ParsedBrief, ChecklistItem, ChatMessage, Note } from './types';
import { useProjects } from './hooks/useProjects';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { useTheme } from './hooks/useTheme';
import { TopBar } from './components/TopBar';
import { ProgressBar } from './components/ProgressBar';
import { VoiceStage, VoiceState } from './components/VoiceStage';
import { ChatOverlay } from './components/ChatOverlay';
import { ConversationsDrawer, HebrewVoice } from './components/ConversationsDrawer';
import { NotesDrawer } from './components/NotesDrawer';
import { RoadmapView } from './components/RoadmapView';
import { UploadModal } from './components/UploadModal';
import { SplashScreen } from './components/SplashScreen';

const nowTime = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

function briefToProject(brief: ParsedBrief, fileName: string): Project {
  const checklist: ChecklistItem[] = brief.suggestedSteps.map((step, idx) => ({
    id: `step-${idx}-${Date.now()}`,
    title: step.title,
    description: step.description,
    phase: step.phase,
    weight: step.weight,
    completed: false
  }));

  return {
    id: `project-${Date.now()}`,
    name: brief.assignmentName || fileName.replace('.pdf', ''),
    courseName: brief.courseName || 'כללי',
    fileName,
    createdAt: new Date().toLocaleDateString('he-IL'),
    lastActive: nowTime(),
    brief,
    checklist,
    messages: [],
    notesList: []
  };
}

// Time-of-day appropriate Hebrew greeting for the voice opening
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  if (h >= 17 && h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function App() {
  const store = useProjects();
  const {
    groupedProjects, activeProject, activeProjectId, setActiveProjectId,
    addProject, deleteProject, appendTranscript, appendProvisionalUserTranscript, addUserVoiceTranscript, resolvePendingUserTranscript, closeAssistantTurn,
    addNote, updateNote, deleteNote, toggleStep, toggleSkipStep, deleteStep, setStepCompleted, setStepSkipped,
    updateStepByTitle, deleteStepByTitle, replaceChecklist, addStep,
    updateProject, profile, updateProfile
  } = store;

  const { theme, toggleTheme } = useTheme();

  const [isConversationsOpen, setIsConversationsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [headerMinimized, setHeaderMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hebrewVoices, setHebrewVoices] = useState<HebrewVoice[]>([]);
  const [showSplash, setShowSplash] = useState(true);

  // Boot splash: plays once, then fades into the app
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 3200);
    return () => clearTimeout(t);
  }, []);

  const activeProjectRef = useRef<Project | undefined>(activeProject);
  activeProjectRef.current = activeProject;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // ---- Voice agent tool execution (the mentor consults the student verbally, then acts) ----
  const handleToolCall = useCallback(async (name: string, args: Record<string, any>): Promise<Record<string, any>> => {
    const project = activeProjectRef.current;
    if (!project) return { ok: false, error: 'אין מטלה פעילה' };

    // After a mutation, wait a beat for React to flush, then report the fresh
    // state back to the model — its session context is a stale snapshot
    const freshProject = async () => {
      await new Promise(r => setTimeout(r, 80));
      return activeProjectRef.current;
    };
    const roadmapSnapshot = (p?: Project) =>
      (p?.checklist || []).map((st, i) => `${i + 1}. "${st.title}" — ${st.completed ? 'הושלם' : st.skipped ? 'דולג' : 'פתוח'}`).join(' | ');
    const notesSnapshot = (p?: Project) =>
      (p?.notesList || []).map(n => `(${n.id}) "${n.title}"`).join(' | ') || 'אין פתקים';

    switch (name) {
      case 'add_note': {
        const note: Note = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: String(args.title || 'פתק מהמנטור'),
          content: String(args.content || ''),
          createdBy: 'ai',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        addNote(note);
        setSuccessMessage('המנטור שמר פתק חדש 📝');
        return { ok: true, noteId: note.id, currentNotes: notesSnapshot(await freshProject()) };
      }
      case 'update_note': {
        const existing = (project.notesList || []).find(n => n.id === args.noteId || n.title === args.noteId);
        if (!existing) return { ok: false, error: 'הפתק לא נמצא. בדוק את רשימת הפתקים בהקשר.' };
        updateNote({
          ...existing,
          title: args.title !== undefined ? String(args.title) : existing.title,
          content: args.content !== undefined ? String(args.content) : existing.content,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('המנטור עדכן פתק 📝');
        return { ok: true };
      }
      case 'delete_note': {
        const existing = (project.notesList || []).find(n => n.id === args.noteId || n.title === args.noteId);
        if (!existing) return { ok: false, error: 'הפתק לא נמצא' };
        deleteNote(existing.id);
        setSuccessMessage('המנטור מחק פתק לבקשתך');
        return { ok: true };
      }
      case 'complete_step': {
        const matched = setStepCompleted(String(args.stepTitle || ''), true);
        if (!matched) return { ok: false, error: 'לא נמצא שלב עם הכותרת הזו במפת הדרכים', currentRoadmap: roadmapSnapshot(project) };
        setSuccessMessage('שלב במפת הדרכים סומן כהושלם! 🎉');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'reopen_step': {
        const matched = setStepCompleted(String(args.stepTitle || ''), false);
        if (!matched) return { ok: false, error: 'לא נמצא שלב עם הכותרת הזו במפת הדרכים', currentRoadmap: roadmapSnapshot(project) };
        setSuccessMessage('שלב במפת הדרכים נפתח מחדש');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'skip_step': {
        const matched = setStepSkipped(String(args.stepTitle || ''), true);
        if (!matched) return { ok: false, error: 'לא נמצא שלב עם הכותרת הזו במפת הדרכים', currentRoadmap: roadmapSnapshot(project) };
        setSuccessMessage('דילגנו על השלב — נחזור אליו בהמשך ⏭️');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'add_step': {
        addStep({
          title: String(args.title || 'שלב חדש'),
          description: String(args.description || ''),
          phase: String(args.phase || 'ideation'),
          isCustom: true
        });
        setSuccessMessage('המנטור הוסיף תחנה חדשה למפת הדרכים');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'update_step': {
        const matched = updateStepByTitle(String(args.stepTitle || ''), {
          title: args.newTitle ? String(args.newTitle) : undefined,
          description: args.newDescription ? String(args.newDescription) : undefined,
          phase: args.newPhase ? String(args.newPhase) : undefined
        });
        if (!matched) return { ok: false, error: 'לא נמצא שלב עם הכותרת הזו במפת הדרכים', currentRoadmap: roadmapSnapshot(project) };
        setSuccessMessage('שלב במפת הדרכים עודכן');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'delete_step': {
        const matched = deleteStepByTitle(String(args.stepTitle || ''));
        if (!matched) return { ok: false, error: 'לא נמצא שלב עם הכותרת הזו במפת הדרכים', currentRoadmap: roadmapSnapshot(project) };
        setSuccessMessage('שלב הוסר ממפת הדרכים');
        return { ok: true, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      case 'replace_roadmap': {
        const steps = Array.isArray(args.steps) ? args.steps : [];
        if (steps.length === 0) return { ok: false, error: 'רשימת השלבים ריקה' };
        replaceChecklist(steps.map((s: any) => ({
          title: String(s.title || 'שלב'),
          description: String(s.description || ''),
          phase: String(s.phase || 'ideation')
        })));
        setSuccessMessage('מפת הדרכים עודכנה לפי מה שסיכמתם! 🗺️');
        return { ok: true, stepsCount: steps.length, currentRoadmap: roadmapSnapshot(await freshProject()) };
      }
      default:
        return { ok: false, error: `כלי לא מוכר: ${name}` };
    }
  }, [addNote, updateNote, deleteNote, setStepCompleted, setStepSkipped, updateStepByTitle, deleteStepByTitle, replaceChecklist, addStep]);

  const voiceAgent = useVoiceAgent({
    onProvisionalUserTranscript: (text) => appendProvisionalUserTranscript(text),
    onUserTranscript: (text) => addUserVoiceTranscript(text),
    onUserTranscriptEmpty: () => resolvePendingUserTranscript(),
    onAgentTranscript: (text) => appendTranscript(text, true),
    onTurnComplete: () => closeAssistantTurn(),
    onToolCall: handleToolCall,
    onError: (message) => setErrorMessage(message)
  });

  const voiceState: VoiceState = voiceAgent.isConnecting
    ? 'connecting'
    : voiceAgent.isListening
      ? (voiceAgent.isPlaying ? 'speaking' : 'listening')
      : activeProject && activeProject.messages.some(m => m.role === 'user')
        ? 'paused'
        : 'idle';

  const conversationActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'connecting';

  // Immersive mode: minimize the header 30 seconds after a conversation starts
  useEffect(() => {
    if (conversationActive && !headerMinimized) {
      const t = setTimeout(() => setHeaderMinimized(true), 30000);
      return () => clearTimeout(t);
    }
    if (!conversationActive && headerMinimized) {
      setHeaderMinimized(false);
    }
  }, [conversationActive, headerMinimized]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);
  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 8000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // Discover Hebrew Cloud TTS voices (kept as an experimental option in settings)
  useEffect(() => {
    fetch('/api/voice-config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.hebrewTts && Array.isArray(cfg.voices) && cfg.voices.length > 0) {
          setHebrewVoices(cfg.voices);
        }
        // User verdict: Gemini native-audio sounds better than Cloud TTS Hebrew —
        // restore a Gemini voice as the default (Cloud voices stay available in the picker)
        if (voiceAgent.voiceURI.startsWith('he-IL')) {
          voiceAgent.setVoiceURI('Aoede');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop any live session when switching projects; close chat overlay
  useEffect(() => {
    voiceAgent.stopLiveSession();
    setIsChatOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // ---- Resume context: everything the mentor needs to continue from the exact last point ----
  const buildVoiceContext = (project: Project): string => {
    const b = project.brief;
    const roadmap = project.checklist
      .map((s, i) => `${i + 1}. [${s.completed ? 'הושלם ✓' : s.skipped ? 'דולג ⏭ (לחזור אליו בהמשך בנקודה ההגיונית)' : 'טרם הושלם'}]${s.weight === 'support' ? ' [שלב פרקטי-לוגיסטי — שאלות ענייניות בלבד]' : s.weight === 'core' ? ' [שלב ליבה יצירתי — כאן מעמיקים]' : ''} ${s.title} — ${s.description}`)
      .join('\n');
    const notes = (project.notesList || [])
      .map(n => `- (noteId: ${n.id}) "${n.title}": ${n.content.slice(0, 200)}`)
      .join('\n');

    const todayStr = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

    let ctx = `התאריך היום: ${todayStr}.

רקע המטלה שאנחנו עובדים עליה יחד:
- שם המטלה: "${b.assignmentName}" (קורס: ${b.courseName})
- דדליין: ${b.deadline}
- מטרות: ${b.goals?.join('; ')}
- דרישות הגשה: ${b.requirements?.join('; ')}
- חוקי הבריף הקריטיים: ${b.assignmentRules?.join('; ') || 'לא הוגדרו'}
- מגבלות: ${b.constraints?.join('; ') || 'אין'}
- הצעד הפרקטי המיידי הראשון: ${b.immediatePracticalStep || 'לא הוגדר'}
- תובנות מחקר מעמיק: ${b.deepResearchInsights?.join('; ') || 'אין'}

מפת הדרכים הנוכחית (עקוב אחריה שלב-אחר-שלב):
${roadmap}

הפתקים הקיימים של הסטודנט (השתמש ב-noteId המדויק בכלי העדכון/מחיקה):
${notes || '(אין פתקים עדיין)'}`;

    if (project.messages.length > 0) {
      const history = project.messages
        .map(m => (m.role === 'assistant' ? 'מנטור: ' : 'סטודנט: ') + m.content)
        .join('\n');
      ctx += `\n\nהיסטוריית השיחה המלאה שלנו עד כה (טקסט וקול). אנא המשך בדיוק מאותה נקודה, בלי לחזור על שאלות שכבר נשאלו:\n${history}`;

      const last = project.messages[project.messages.length - 1];
      if (last.role === 'assistant') {
        ctx += `\n\n**הנחיה קריטית**: ההודעה האחרונה בשיחה הייתה שלך (המנטור). המתן בשקט שהסטודנט יתחיל לדבר — אל תפתח בדיבור יזום, מלבד משפט קצר אחד של "חזרנו! איפה עצרנו..." אם הסטודנט שותק זמן רב.`;
      } else {
        ctx += `\n\n**הנחיה קריטית**: ההודעה האחרונה בשיחה הייתה של הסטודנט: "${last.content}". השב לו ישירות עליה כעת והמשך את השיח ממנה.`;
      }
    } else {
      const name = profileRef.current?.name || '';
      ctx += `\n\nזוהי תחילת השיחה הראשונה שלנו על המטלה הזו. פתח את השיחה בדיוק לפי התסריט הבא, שלב אחד בלבד בכל תור דיבור — דבר, עצור, והמתן לתשובת הסטודנט לפני שתמשיך לשלב הבא:

שלב א' — פתיחה אחת רציפה (הכל באותו תור דיבור!): פתח בברכה: "${timeGreeting()}${name ? ' ' + name : ''}! מה שלומך?" — ובלי לעצור, המשך מיד באותה נשימה: ספר שהסתכלת על הבריף שהוא העלה, שתף בקצרה במשפט אחד מה התרשמותך ממנו (מה מעניין או מאתגר בו), ושאל אם הוא רוצה שתסכם לו אותו בקצרה לפני שמתחילים. רק בסוף כל זה עצור והמתן לתשובתו (ייתכן שיענה גם על השלום וגם על הסיכום באותה תשובה — הגב לשניהם).

שלב ב' — סיכום (רק אם ביקש): סכם בקצרה וממוקד: המטרה המרכזית של הבריף, השלבים שהוגדרו בו (אם הוגדרו), הטכניקות שהוא מערב, הרעיון המרכזי, ותאריך ההגשה כולל כמה ימים נותרו עד אליו מהיום. אחרי הסיכום עצור רגע לשאלה אישית קצרה על הסטודנט (איך הוא מרגיש עם זה, ממה הוא מתלהב או חושש). אם לא ביקש סיכום — דלג ישר לשלב הבא.

שלב ג' — הצגת מפת הדרכים: אמור בסגנון "בניתי לך מפת דרכים שאני חושב שתהיה הכי אפקטיבית להשגת המטרה", עבור בקצרה ובחיות על השלבים שבה, ואז שאל את דעתו — והאם הוא רוצה לשנות בה משהו. עצור והמתן.

שלב ד' — עדכון המפה (אם רוצה שינוי): שאל איך בדיוק היה רוצה שתיראה, ועדכן אותה בעזרת הכלים (update_step / delete_step / add_step / replace_roadmap) עד שהוא מרוצה. רצונו קובע.

שלב ה' — רק אחרי שהמשתמש מרוצה מהמפה: התחל את הליווי הסוקרטי הרגיל מהשלב הראשון במפה.`;
    }

    return ctx;
  };

  const handleVoiceToggle = async () => {
    if (voiceAgent.isListening || voiceAgent.isConnecting) {
      voiceAgent.stopLiveSession();
      return;
    }
    const project = activeProjectRef.current;
    if (!project) return;
    await voiceAgent.startLiveSession(buildVoiceContext(project), profileRef.current, project.messages.length === 0);
  };

  // ---- Text chat fallback (keeps the 5-candidate Socratic engine) ----
  const sendMessage = async (text: string) => {
    const project = activeProjectRef.current;
    if (!text.trim() || !project) return;

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: text,
      source: 'text',
      timestamp: nowTime()
    };

    const updatedMessages = [...project.messages, userMessage];
    updateProject(project.id, p => ({ ...p, messages: [...p.messages, userMessage], lastActive: nowTime() }));
    setIsSending(true);

    try {
      const firstUncompleted = project.checklist.find(item => !item.completed && !item.skipped);
      const activePhase = firstUncompleted ? firstUncompleted.phase : 'review';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          briefContext: project.brief,
          currentPhase: activePhase,
          checklist: project.checklist,
          scratchpad: project.notesList?.map(n => `${n.title}\n${n.content}`).join('\n\n') || project.notes || '',
          profile: profileRef.current
        })
      });

      if (!response.ok) {
        throw new Error('נכשלה תגובת שרת ה-AI');
      }

      const outcome = await response.json();

      const assistantMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: outcome.content,
        source: 'text',
        timestamp: nowTime(),
        userMoodAnalysis: outcome.userMoodAnalysis,
        currentPhaseAnalysis: outcome.currentPhaseAnalysis,
        candidates: outcome.candidates,
        winningCandidateId: outcome.winningCandidateId
      };

      updateProject(project.id, p => {
        let checklist = p.checklist;
        const norm = (s: string) => s.toLowerCase().trim();
        const inList = (list: any, itemTitle: string) =>
          Array.isArray(list) && list.some((title: string) =>
            title && (norm(itemTitle) === norm(title) || norm(itemTitle).includes(norm(title)) || norm(title).includes(norm(itemTitle)))
          );
        checklist = p.checklist.map(item => {
          if (inList(outcome.completedStepTitles, item.title)) return { ...item, completed: true, skipped: false };
          if (inList(outcome.skippedStepTitles, item.title)) return { ...item, skipped: true };
          return item;
        });
        return {
          ...p,
          checklist,
          notes: outcome.updatedScratchpadText || p.notes,
          messages: [...p.messages, assistantMessage],
          lastActive: nowTime()
        };
      });

      if (outcome.userProfileUpdates) {
        updateProfile(outcome.userProfileUpdates);
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: `מתנצל, נתקלתי בקושי זמני בתקשורת עם השרת: ${err.message || 'שגיאה לא מוגדרת'}. אנא נסה שוב.`,
        source: 'text',
        timestamp: nowTime()
      };
      updateProject(project.id, p => ({ ...p, messages: [...p.messages, errorMsg] }));
    } finally {
      setIsSending(false);
    }
  };

  // ---- Brief PDF upload ----
  const handlePdfUpload = async (file: File) => {
    setErrorMessage(null);
    if (!file || file.type !== 'application/pdf') {
      setErrorMessage('אנא בחר קובץ PDF תקין המכיל את הבריף של המטלה');
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const response = await fetch('/api/analyze-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64Data, originalFileName: file.name })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'נכשל ניתוח הקובץ בשרת');
        }

        const parsedBrief: ParsedBrief = await response.json();
        const newProject = briefToProject(parsedBrief, file.name);
        addProject(newProject);
        setIsUploadOpen(false);
        setSuccessMessage('הבריף נטען — המנטור פותח את השיחה…');
        // Auto-start: the mentor greets by name and runs the opening script
        setTimeout(() => {
          voiceAgent.startLiveSession(buildVoiceContext(newProject), profileRef.current, true);
        }, 400);
      } catch (error: any) {
        console.error('Error reading brief details:', error);
        setErrorMessage(`שגיאה בפיענוח הבריף: ${error.message || 'נא לוודא שישנו חיבור אינטרנט והמפתח מוגדר כראוי.'}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage('נכשלה קריאת הקובץ על ידי הדפדפן במכשיר המקומי');
      setIsLoading(false);
    };
  };

  const loadSample = (sample: ParsedBrief) => {
    const newProject = briefToProject(sample, 'דוגמה_מובנית_מערכת.pdf');
    addProject(newProject);
    setIsUploadOpen(false);
    setSuccessMessage('הדוגמה נטענה — המנטור פותח את השיחה…');
    setTimeout(() => {
      voiceAgent.startLiveSession(buildVoiceContext(newProject), profileRef.current, true);
    }, 400);
  };

  // ---- Edge-swipe to open drawers on mobile ----
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dy > 60) return;
    const width = window.innerWidth;
    if (start.x > width - 32 && dx < -50) setIsConversationsOpen(true);
    if (start.x < 32 && dx > 50 && activeProject) setIsNotesOpen(true);
  };

  return (
    <div className="h-[100dvh] bg-canvas text-ink flex flex-row font-sans overflow-hidden transition-colors duration-300" dir="rtl">
      {/* Boot splash */}
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" />}
      </AnimatePresence>

      {/* Right (RTL-first): conversation history */}
      <ConversationsDrawer
        open={isConversationsOpen}
        onClose={() => setIsConversationsOpen(false)}
        groupedProjects={groupedProjects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProjectId}
        onDelete={deleteProject}
        onNewBrief={() => setIsUploadOpen(true)}
        voiceURI={voiceAgent.voiceURI}
        setVoiceURI={voiceAgent.setVoiceURI}
        hebrewVoices={hebrewVoices}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Center column — immersive stage */}
      <div
        className="flex-1 flex flex-col min-w-0 h-full relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background motif layer: a diagonal composition — yellow square top-right,
            the red circle button center, blue triangle bottom-left */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
          <span
            className="absolute -right-8 -top-10 w-56 h-56 bg-bauhaus-yellow rotate-[24deg] blur-[18px] opacity-50"
            style={{ marginTop: 'env(safe-area-inset-top)' }}
          />
          <span
            className="absolute -left-24 -bottom-10 w-0 h-0 border-l-[135px] border-r-[135px] border-b-[230px] border-l-transparent border-r-transparent border-b-bauhaus-blue blur-[20px] opacity-50 rotate-[-24deg]"
          />
        </div>

        <TopBar
          project={activeProject}
          minimized={headerMinimized}
          conversationsOpen={isConversationsOpen}
          notesOpen={isNotesOpen}
          onOpenConversations={() => { setHeaderMinimized(false); setIsConversationsOpen(true); }}
          onOpenNotes={() => { setHeaderMinimized(false); setIsNotesOpen(true); }}
        />

        {/* Floating roadmap pill — hidden while open so it can morph into the card.
            In immersive mode it shrinks to dots, rises to the icons row and dims;
            tapping it then restores the full header instead of opening the roadmap. */}
        {activeProject && !isRoadmapOpen && (
          <motion.div
            animate={{ opacity: headerMinimized ? 0.38 : 1, y: headerMinimized ? -57 : 0 }}
            transition={{ duration: 0.75, ease: [0.32, 0.72, 0, 1] }}
            className="absolute top-[4.75rem] inset-x-0 px-4 z-20 flex justify-center pointer-events-none"
            style={{ marginTop: 'env(safe-area-inset-top)' }}
          >
            <ProgressBar
              checklist={activeProject.checklist}
              minimized={headerMinimized}
              onOpenRoadmap={() => {
                if (headerMinimized) {
                  setHeaderMinimized(false);
                } else {
                  setIsRoadmapOpen(true);
                }
              }}
            />
          </motion.div>
        )}

        {/* Toasts */}
        <div className="absolute top-32 left-3 right-3 z-40 space-y-2 pointer-events-none">
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-strong rounded-2xl border border-bauhaus-red/50 text-ink px-4 py-3 flex items-start justify-between gap-3 text-sm pointer-events-auto"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-bauhaus-red" />
                  <span className="font-bold">{errorMessage}</span>
                </div>
                <button onClick={() => setErrorMessage(null)} aria-label="סגור"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-strong rounded-2xl border border-bauhaus-blue/50 text-ink px-4 py-3 flex items-start justify-between gap-3 text-sm pointer-events-auto"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-bauhaus-blue" />
                  <span className="font-bold">{successMessage}</span>
                </div>
                <button onClick={() => setSuccessMessage(null)} aria-label="סגור"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Main stage: tapping empty space restores the header */}
        <main
          className="flex-1 flex items-center justify-center relative overflow-hidden px-6"
          onClick={(e) => {
            if (e.target === e.currentTarget && headerMinimized) setHeaderMinimized(false);
          }}
        >
          {activeProject ? (
            <VoiceStage
              state={voiceState}
              disabled={!activeProject}
              onToggle={handleVoiceToggle}
              getInputLevel={voiceAgent.getInputLevel}
              getOutputLevel={voiceAgent.getOutputLevel}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-5 pointer-events-none">
              <div className="flex items-center gap-2" aria-hidden>
                <span className="w-8 h-8 rounded-full bg-bauhaus-red" />
                <span className="w-0 h-0 border-l-[16px] border-r-[16px] border-b-[28px] border-l-transparent border-r-transparent border-b-bauhaus-blue" />
                <span className="w-8 h-8 bg-bauhaus-yellow" />
              </div>
              <h2 className="text-2xl font-bold text-ink">ברוך הבא ל-Briefer</h2>
              <p className="text-ink/55 text-base leading-relaxed max-w-xs">
                מנטור קולי אישי שעוזר לך לפצח את הבריף בעצמך — בלי לקבל פתרונות מוכנים.
              </p>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="pointer-events-auto rounded-full bg-bauhaus-red text-white font-bold text-base px-7 py-3.5 flex items-center gap-2.5 shadow-hard active:translate-y-[2px] active:shadow-none transition-all"
              >
                <Upload className="w-5 h-5" strokeWidth={2.5} />
                העלה בריף ראשון
              </button>
            </div>
          )}
        </main>

        {/* Chat FAB — bottom-right corner */}
        <AnimatePresence>
          {activeProject && !isChatOpen && (
            <motion.button
              layoutId="chat-morph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ layout: { type: 'spring', stiffness: 520, damping: 38 } }}
              onClick={() => setIsChatOpen(true)}
              className="absolute bottom-6 right-5 z-30 w-14 h-14 glass-strong border border-ink/25 text-ink flex items-center justify-center shadow-lg shadow-ink/15 active:scale-90"
              style={{ marginBottom: 'env(safe-area-inset-bottom)', borderRadius: 999 }}
              aria-label="פתח שיחה כתובה"
            >
              <IconChat className="w-[26px] h-[26px]" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Chat overlay (conversation + text input) */}
        <ChatOverlay
          open={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={activeProject?.messages || []}
          sending={isSending}
          onSend={sendMessage}
        />
      </div>

      {/* Left (RTL-last): notes for the active conversation */}
      <NotesDrawer
        open={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
        project={activeProject}
        onAddNote={addNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />

      {/* Full roadmap sheet */}
      <AnimatePresence>
        {isRoadmapOpen && activeProject && (
          <RoadmapView
            project={activeProject}
            onClose={() => setIsRoadmapOpen(false)}
            onToggleStep={(stepId) => toggleStep(activeProject.id, stepId)}
            onToggleSkip={(stepId) => toggleSkipStep(activeProject.id, stepId)}
            onDeleteStep={(stepId) => deleteStep(activeProject.id, stepId)}
            onAddStep={(title, phase) => {
              addStep({ title, description: 'יעד שהוגדר אישית על ידי המשתמש.', phase, isCustom: true });
              setSuccessMessage('תחנה אישית נוספה למפת הדרכים!');
            }}
          />
        )}
      </AnimatePresence>

      <UploadModal
        open={isUploadOpen}
        loading={isLoading}
        onClose={() => !isLoading && setIsUploadOpen(false)}
        onUpload={handlePdfUpload}
        onLoadSample={loadSample}
        onError={setErrorMessage}
      />
    </div>
  );
}
