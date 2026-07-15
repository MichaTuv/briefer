# MentorAI v2 — Design Spec (2026-07-12)

AI voice mentor for first-year Visual Communication students at Bezalel. The student uploads a brief PDF; the app builds a roadmap and holds a Socratic voice conversation that helps the student think for themselves — never handing them solutions.

Approved by user on 2026-07-12. Decisions: Hebrew RTL only; drawers on mobile that dock as panels on desktop; keep the 5-candidate scoring engine for text chat; live voice agent gets full tool use.

## 1. Layout (mobile-first)

- **Top bar**: assignment header strip + live progress bar (roadmap stations as geometric nodes, current stage name, "station X of Y"). Tap → full roadmap view. Animates when steps complete.
- **Center stage**: voice agent element with idle/listening/speaking states. Below it a compact chat feed mirroring the spoken conversation (last messages visible; expandable to full scrollable history).
- **Right drawer**: conversation history in collapsible folders per course. Swipe from right edge or tap header button.
- **Left drawer**: notes for the active conversation (text + images). Each note tagged `createdBy: 'user' | 'ai'`. AI modifies notes only after explicit verbal consent.
- **Bottom strip**: pause/continue conversation, text input fallback, "+" upload new brief.
- **Responsive**: ≥1024px docks both drawers as permanent panels. Phone layout uses 100dvh + safe-area insets.

## 2. Visual language — modern Bauhaus

Red/blue/yellow/black/off-white palette, strict grid, flat geometric shapes, hard offset shadows, bold Rubik type, circular/triangular accents; modern micro-animations via `motion`, generous whitespace. Hebrew RTL throughout.

## 3. Voice agent tools

Gemini Live API session configured with function declarations:
`add_note`, `update_note`, `delete_note`, `complete_step`, `add_step`, `reopen_step`.

Flow: model emits toolCall → server relays over WebSocket → client executes against project state (localStorage) → client returns result → server sends toolResponse → mentor confirms verbally. Tool descriptions require explicit user consent first.

Transcription: use Live API `inputAudioTranscription` / `outputAudioTranscription` instead of browser SpeechRecognition. Transcripts persist as chat messages.

Pause/continue: full context rebuild on resume — brief, roadmap state, notes, conversation history, learning profile.

## 4. Socratic behavior — single source of truth

One shared mentor-prompt module (`src/../shared/mentorPrompt.ts` used by server) feeding brief analysis, text chat, and voice prompts. Rules: no solutions; one open question per turn; no option lists; no proactive interpretation of concepts; follow roadmap linearly; branching allowed on user request but always name the unfinished earlier step; explicit consent before any note/roadmap change; warm human voice-like Hebrew. Text chat keeps the 5-candidate scoring engine.

## 5. Cross-conversation context

`UserProfile` stored in localStorage: guidance-style preferences, pace, recurring struggles, vocabulary. The chat JSON schema gains a `userProfileUpdates` field; profile is injected into all prompts (text + voice).

## 6. Code structure

Split `App.tsx` into: `TopBar`, `ProgressBar`, `VoiceStage`, `ChatFeed`, `ConversationsDrawer`, `NotesDrawer`, `RoadmapView`, `UploadModal`, plus a project store hook (`useProjects`). Types extended: `Note.createdBy`, `UserProfile`. Storage remains localStorage.

## 7. Verification

`npm run lint` (tsc), run dev server, drive in Chrome at phone dimensions: layout/proportions, drawers, chat feed expand/collapse, progress updates, upload flow with sample briefs, and tool-call plumbing.
