import { useState, useEffect, useRef, useCallback } from 'react';
import { Project, Note, ChecklistItem, ChatMessage, UserProfile } from '../types';

const PROJECTS_KEY = 'mentor_ai_projects';
const PROFILE_KEY = 'mentor_ai_profile';

const nowTime = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export const emptyProfile = (): UserProfile => ({
  name: 'מיכה',
  guidanceStyle: '',
  pace: '',
  strengths: [],
  struggles: [],
  vocabulary: [],
  lastUpdated: new Date().toISOString()
});

function persist(projects: Project[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed persisting projects', e);
  }
}

// Older saved projects predate createdBy/source fields — fill safe defaults
function migrate(projects: Project[]): Project[] {
  return projects.map(p => ({
    ...p,
    notesList: (p.notesList || []).map(n => ({ ...n, createdBy: n.createdBy || 'user' }))
  }));
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);

  const activeIdRef = useRef(activeProjectId);
  activeIdRef.current = activeProjectId;
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECTS_KEY);
      if (saved) {
        const parsed = migrate(JSON.parse(saved));
        if (parsed.length > 0) {
          setProjects(parsed);
          setActiveProjectId(parsed[0].id);
        }
      }
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (savedProfile) setProfile({ ...emptyProfile(), ...JSON.parse(savedProfile) });
    } catch (e) {
      console.error('Failed loading saved state', e);
    }
  }, []);

  const mutateProjects = useCallback((updater: (prev: Project[]) => Project[]) => {
    setProjects(prev => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, []);

  const updateProject = useCallback((id: string, updater: (p: Project) => Project) => {
    mutateProjects(prev => prev.map(p => (p.id === id ? updater(p) : p)));
  }, [mutateProjects]);

  const updateActiveProject = useCallback((updater: (p: Project) => Project) => {
    const id = activeIdRef.current;
    if (id) updateProject(id, updater);
  }, [updateProject]);

  const addProject = useCallback((project: Project) => {
    mutateProjects(prev => [project, ...prev]);
    setActiveProjectId(project.id);
  }, [mutateProjects]);

  const deleteProject = useCallback((id: string) => {
    mutateProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activeIdRef.current === id) {
        setActiveProjectId(next.length > 0 ? next[0].id : '');
      }
      return next;
    });
  }, [mutateProjects]);

  // Tracks whether the mentor is mid-turn: fragments merge into the same bubble
  // only while the turn is open; each new turn gets its own bubble
  const assistantTurnOpenRef = useRef(false);

  // Merge same-turn voice fragments into one message bubble
  const appendTranscript = useCallback((text: string, isAgent: boolean) => {
    if (!text) return;
    const role = isAgent ? 'assistant' : 'user';
    updateActiveProject(p => {
      const messages = [...p.messages];
      const last = messages[messages.length - 1];
      const canMerge = last && last.role === role && last.source === 'voice' &&
        (!isAgent || assistantTurnOpenRef.current);
      if (canMerge) {
        const separator = isAgent ? '' : (last.content.endsWith(' ') ? '' : ' ');
        messages[messages.length - 1] = { ...last, content: last.content + separator + text };
      } else {
        messages.push({
          id: `msg-voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          content: text,
          source: 'voice',
          timestamp: nowTime()
        });
      }
      if (isAgent) assistantTurnOpenRef.current = true;
      return { ...p, messages, lastActive: nowTime() };
    });
  }, [updateActiveProject]);

  // Called on turn-complete / interruption: the next mentor fragment starts a new bubble
  const closeAssistantTurn = useCallback(() => {
    assistantTurnOpenRef.current = false;
  }, []);

  // Provisional live transcription: streams into a pending user bubble as the
  // user speaks, giving instant feedback (corrected later by the accurate pass)
  const appendProvisionalUserTranscript = useCallback((text: string) => {
    if (!text) return;
    updateActiveProject(p => {
      const messages = [...p.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && last.source === 'voice' && last.pending) {
        const separator = last.content.endsWith(' ') ? '' : ' ';
        messages[messages.length - 1] = { ...last, content: last.content + separator + text };
      } else {
        messages.push({
          id: `msg-voice-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'user',
          content: text,
          source: 'voice',
          pending: true,
          timestamp: nowTime()
        });
      }
      return { ...p, messages, lastActive: nowTime() };
    });
  }, [updateActiveProject]);

  // The accurate pass heard nothing usable: keep the provisional wording if it
  // looks like real speech (the live model's own hearing), otherwise drop the
  // bubble entirely — noise never deserves a bubble
  const resolvePendingUserTranscript = useCallback(() => {
    updateActiveProject(p => {
      const messages = [...p.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && m.source === 'voice' && m.pending) {
          const words = m.content.trim().split(/\s+/).filter(Boolean);
          if (words.length >= 2) {
            messages[i] = { ...m, pending: false };
          } else {
            messages.splice(i, 1);
          }
          return { ...p, messages, lastActive: nowTime() };
        }
        if (m.role === 'user') break;
      }
      return p;
    });
  }, [updateActiveProject]);

  // Accurate transcript: replaces the pending bubble (or inserts in order if none)
  const addUserVoiceTranscript = useCallback((text: string) => {
    if (!text) return;
    updateActiveProject(p => {
      const messages = [...p.messages];

      // Replace the most recent pending user bubble if there is one
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && m.source === 'voice' && m.pending) {
          messages[i] = { ...m, content: text, pending: false };
          return { ...p, messages, lastActive: nowTime() };
        }
        if (m.role === 'user') break; // older turns — stop searching
      }

      const userMsg: ChatMessage = {
        id: `msg-voice-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        content: text,
        source: 'voice',
        timestamp: nowTime()
      };
      const last = messages[messages.length - 1];
      // Only slot before the trailing mentor bubble if that turn is still streaming
      if (last && last.role === 'assistant' && last.source === 'voice' && assistantTurnOpenRef.current) {
        messages.splice(messages.length - 1, 0, userMsg);
      } else {
        messages.push(userMsg);
      }
      return { ...p, messages, lastActive: nowTime() };
    });
  }, [updateActiveProject]);

  const addNote = useCallback((note: Note) => {
    updateActiveProject(p => ({ ...p, notesList: [note, ...(p.notesList || [])] }));
  }, [updateActiveProject]);

  const updateNote = useCallback((note: Note) => {
    updateActiveProject(p => ({
      ...p,
      notesList: (p.notesList || []).map(n => (n.id === note.id ? note : n))
    }));
  }, [updateActiveProject]);

  const deleteNote = useCallback((noteId: string) => {
    updateActiveProject(p => ({
      ...p,
      notesList: (p.notesList || []).filter(n => n.id !== noteId)
    }));
  }, [updateActiveProject]);

  const toggleStep = useCallback((projectId: string, stepId: string) => {
    updateProject(projectId, p => ({
      ...p,
      checklist: p.checklist.map(i => (i.id === stepId ? { ...i, completed: !i.completed } : i))
    }));
  }, [updateProject]);

  const toggleSkipStep = useCallback((projectId: string, stepId: string) => {
    updateProject(projectId, p => ({
      ...p,
      checklist: p.checklist.map(i => (i.id === stepId ? { ...i, skipped: !i.skipped, completed: false } : i))
    }));
  }, [updateProject]);

  const deleteStep = useCallback((projectId: string, stepId: string) => {
    updateProject(projectId, p => ({
      ...p,
      checklist: p.checklist.filter(i => i.id !== stepId)
    }));
  }, [updateProject]);

  const norm = (s: string) => s.toLowerCase().trim().replace(/["'\u05f3\u05f4.,!?:;()\-\u2013\u2014]/g, '').replace(/\s+/g, ' ');
  const titleMatches = (a: string, b: string) => {
    const na = norm(a);
    const nb = norm(b);
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    // Token-overlap fallback: catches "בניית האב-טיפוס" vs "תכנון ובניית אבטיפוס"
    const ta = new Set(na.replace(/ /g, '').length > 0 ? na.split(' ') : []);
    const tb = new Set(nb.split(' '));
    if (ta.size === 0 || tb.size === 0) return false;
    let shared = 0;
    ta.forEach(t => {
      if (t.length < 2) return;
      tb.forEach(u => {
        if (u.length < 2) return;
        if (t === u || t.includes(u) || u.includes(t)) shared++;
      });
    });
    const needed = Math.min(ta.size, tb.size);
    return shared >= Math.max(1, Math.ceil(needed * 0.6));
  };

  // Reads the active project synchronously — state updaters run lazily, so
  // match checks must happen BEFORE queuing the update, not inside it
  const getActiveSync = useCallback(() =>
    projectsRef.current.find(p => p.id === activeIdRef.current), []);

  // Fuzzy title match so AI-supplied step titles land on the right checklist item
  const setStepCompleted = useCallback((title: string, completed: boolean): boolean => {
    const proj = getActiveSync();
    const matched = !!proj?.checklist.some(item => titleMatches(item.title, title));
    if (!matched) return false;
    updateActiveProject(p => ({
      ...p,
      checklist: p.checklist.map(item =>
        titleMatches(item.title, title) ? { ...item, completed, skipped: false } : item
      )
    }));
    return true;
  }, [updateActiveProject, getActiveSync]);

  const setStepSkipped = useCallback((title: string, skipped: boolean): boolean => {
    const proj = getActiveSync();
    const matched = !!proj?.checklist.some(item => titleMatches(item.title, title));
    if (!matched) return false;
    updateActiveProject(p => ({
      ...p,
      checklist: p.checklist.map(item =>
        titleMatches(item.title, title) ? { ...item, skipped, completed: skipped ? false : item.completed } : item
      )
    }));
    return true;
  }, [updateActiveProject, getActiveSync]);

  const updateStepByTitle = useCallback((title: string, changes: { title?: string; description?: string; phase?: string }): boolean => {
    const proj = getActiveSync();
    const targetId = proj?.checklist.find(item => titleMatches(item.title, title))?.id;
    if (!targetId) return false;
    updateActiveProject(p => ({
      ...p,
      checklist: p.checklist.map(item =>
        item.id === targetId
          ? {
              ...item,
              title: changes.title || item.title,
              description: changes.description || item.description,
              phase: changes.phase || item.phase
            }
          : item
      )
    }));
    return true;
  }, [updateActiveProject, getActiveSync]);

  const deleteStepByTitle = useCallback((title: string): boolean => {
    const proj = getActiveSync();
    const targetId = proj?.checklist.find(item => titleMatches(item.title, title))?.id;
    if (!targetId) return false;
    updateActiveProject(p => ({
      ...p,
      checklist: p.checklist.filter(item => item.id !== targetId)
    }));
    return true;
  }, [updateActiveProject, getActiveSync]);

  // Full roadmap rewrite (after the user approved changes); keeps completion of same-titled steps
  const replaceChecklist = useCallback((steps: Array<{ title: string; description: string; phase: string }>) => {
    updateActiveProject(p => ({
      ...p,
      checklist: steps.map((s, idx) => {
        const existing = p.checklist.find(item => titleMatches(item.title, s.title));
        return {
          id: existing?.id || `step-replaced-${Date.now()}-${idx}`,
          title: s.title,
          description: s.description,
          phase: s.phase,
          completed: existing?.completed || false,
          skipped: existing?.skipped || false,
          isCustom: true
        };
      })
    }));
  }, [updateActiveProject]);

  const addStep = useCallback((item: Omit<ChecklistItem, 'id' | 'completed'>) => {
    updateActiveProject(p => ({
      ...p,
      checklist: [...p.checklist, {
        ...item,
        id: `step-custom-${Date.now()}`,
        completed: false
      }]
    }));
  }, [updateActiveProject]);

  const appendMessages = useCallback((projectId: string, newMessages: ChatMessage[]) => {
    updateProject(projectId, p => ({
      ...p,
      messages: [...p.messages, ...newMessages],
      lastActive: nowTime()
    }));
  }, [updateProject]);

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfile(prev => {
      const merged: UserProfile = {
        name: partial.name?.trim() || prev.name,
        guidanceStyle: partial.guidanceStyle?.trim() || prev.guidanceStyle,
        pace: partial.pace?.trim() || prev.pace,
        strengths: partial.strengths?.length ? partial.strengths : prev.strengths,
        struggles: partial.struggles?.length ? partial.struggles : prev.struggles,
        vocabulary: partial.vocabulary?.length ? partial.vocabulary : prev.vocabulary,
        lastUpdated: new Date().toISOString()
      };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      } catch (e) {
        console.error('Failed persisting profile', e);
      }
      return merged;
    });
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const groupedProjects = projects.reduce((acc, p) => {
    const course = p.courseName || 'כללי';
    (acc[course] = acc[course] || []).push(p);
    return acc;
  }, {} as Record<string, Project[]>);

  return {
    projects,
    groupedProjects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    addProject,
    deleteProject,
    updateProject,
    updateActiveProject,
    appendTranscript,
    appendProvisionalUserTranscript,
    addUserVoiceTranscript,
    resolvePendingUserTranscript,
    closeAssistantTurn,
    appendMessages,
    addNote,
    updateNote,
    deleteNote,
    toggleStep,
    toggleSkipStep,
    deleteStep,
    setStepCompleted,
    setStepSkipped,
    updateStepByTitle,
    deleteStepByTitle,
    replaceChecklist,
    addStep,
    profile,
    updateProfile
  };
}
