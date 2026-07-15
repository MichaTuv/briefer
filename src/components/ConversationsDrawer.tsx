import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Trash2, Volume2, Sun, Moon } from 'lucide-react';
import { Project } from '../types';
import { Theme } from '../hooks/useTheme';
import { IconFolder, IconSettings, IconPlus } from './icons';

export interface HebrewVoice {
  name: string;
  gender: string;
  label?: string;
}

interface ConversationsDrawerProps {
  open: boolean;
  onClose: () => void;
  groupedProjects: Record<string, Project[]>;
  activeProjectId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewBrief: () => void;
  voiceURI: string;
  setVoiceURI: (v: string) => void;
  hebrewVoices?: HebrewVoice[];
  theme: Theme;
  onToggleTheme: () => void;
}

const VOICES = [
  { id: 'Aoede', label: 'אואדה — נשי, חם ורך' },
  { id: 'Sulafat', label: 'סולפת — נשי, חם וטבעי' },
  { id: 'Leda', label: 'לדה — נשי, צעיר ואנרגטי' },
  { id: 'Kore', label: 'קורה — נשי, בטוח וישיר' },
  { id: 'Despina', label: 'דספינה — נשי, חלק ונינוח' },
  { id: 'Zephyr', label: 'זפיר — נשי, בהיר וקליל' },
  { id: 'Puck', label: 'פאק — גברי, קליל ואופטימי' },
  { id: 'Charon', label: 'כארון — גברי, עמוק ורגוע' },
  { id: 'Orus', label: 'אורוס — גברי, יציב וסמכותי' },
  { id: 'Enceladus', label: 'אנקלדוס — גברי, שקט ואוורירי' },
  { id: 'Iapetus', label: 'יאפטוס — גברי, ברור וענייני' },
  { id: 'Fenrir', label: 'פנריר — גברי, נמרץ' }
];

function hebrewVoiceLabel(v: HebrewVoice): string {
  if (v.label) return v.label;
  const short = v.name.replace(/^he-IL-/, '').replace(/-/g, ' ');
  const gender = v.gender === 'FEMALE' ? 'נשי' : v.gender === 'MALE' ? 'גברי' : '';
  return gender ? `${short} · ${gender}` : short;
}

// Inline settings panel: expands horizontally from the gear icon.
// Add future settings as more rows here.
function SettingsPanel({ voiceURI, setVoiceURI, hebrewVoices, theme, onToggleTheme }: Pick<ConversationsDrawerProps, 'voiceURI' | 'setVoiceURI' | 'hebrewVoices' | 'theme' | 'onToggleTheme'>) {
  return (
    <div className="space-y-4 py-3 px-4 min-w-64" dir="rtl">
      {/* Voice selection */}
      <div>
        <label className="text-[10px] font-bold text-ink/60 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
          <Volume2 className="w-3.5 h-3.5" />
          קול המנטור
        </label>
        <select
          className="w-full border border-ink/25 rounded-xl p-2.5 text-sm font-bold bg-paper text-ink outline-none focus:border-ink transition-colors"
          value={voiceURI}
          onChange={(e) => setVoiceURI(e.target.value)}
        >
          {hebrewVoices && hebrewVoices.length > 0 ? (
            <>
              <optgroup label="קולות המנטור">
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </optgroup>
              <optgroup label="קולות Google Cloud (עברית — לניסוי)">
                {hebrewVoices.map(v => <option key={v.name} value={v.name}>{hebrewVoiceLabel(v)}</option>)}
              </optgroup>
            </>
          ) : (
            VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)
          )}
        </select>
      </div>

      {/* Dark / light mode */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-ink/60 uppercase tracking-widest flex items-center gap-1.5">
          {theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          מצב תצוגה
        </span>
        <button
          onClick={onToggleTheme}
          className={`relative w-14 h-7 rounded-full border border-ink/25 transition-colors ${theme === 'dark' ? 'bg-ink/80' : 'bg-bauhaus-yellow/60'}`}
          aria-label={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`absolute top-0.5 w-6 h-6 rounded-full bg-paper border border-ink/20 flex items-center justify-center ${theme === 'dark' ? 'left-0.5' : 'right-0.5'}`}
          >
            {theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-ink" /> : <Sun className="w-3.5 h-3.5 text-ink" />}
          </motion.span>
        </button>
      </div>
    </div>
  );
}

function DrawerContent(props: Omit<ConversationsDrawerProps, 'open'> & { showClose: boolean }) {
  const { groupedProjects, activeProjectId, onSelect, onDelete, onNewBrief, onClose, showClose } = props;
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isExpanded = (course: string) => expandedCourses[course] !== false; // default expanded
  const courses = Object.entries(groupedProjects);

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <div className="px-4 py-3.5 border-b border-ink/15 flex justify-between items-center shrink-0">
        <h2
          onClick={onClose}
          role="button"
          aria-label="סגור"
          className="font-bold text-lg text-ink flex items-center gap-2 cursor-pointer"
        >
          <span className="w-3 h-3 bg-bauhaus-red rounded-full inline-block" aria-hidden />
          השיחות שלי
        </h2>
        {/* Settings gear sits at the drawer's top-left (visual left in RTL = end of row) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className={`p-2 rounded-full transition-colors ${settingsOpen ? 'bg-ink/10 text-ink' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'}`}
            aria-label="הגדרות"
            aria-expanded={settingsOpen}
          >
            <motion.span animate={{ rotate: settingsOpen ? 90 : 0 }} transition={{ duration: 0.25 }} className="block">
              <IconSettings className="w-5 h-5" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* Inline settings: horizontal left-to-right expansion */}
      <AnimatePresence initial={false}>
        {settingsOpen && (
          <div className="border-b border-ink/15 overflow-hidden shrink-0" dir="ltr">
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              exit={{ width: 0, opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <SettingsPanel {...props} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permanent "new conversation" action — same pill style as "פתק חדש" / "תחנה חדשה" */}
      <div className="pt-3 shrink-0 flex justify-center">
        <button
          onClick={() => { onNewBrief(); onClose(); }}
          className="rounded-full bg-bauhaus-red text-white font-bold text-sm pl-5 pr-4 py-3 flex items-center gap-2 shadow-lg shadow-ink/25 active:scale-95 transition-transform"
        >
          <IconPlus className="w-4 h-4" />
          מטלה חדשה
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {courses.length === 0 ? (
          <p className="text-sm text-ink/50 text-center mt-10 px-4 leading-relaxed">
            עדיין אין שיחות.
            <br />
            העלה בריף ראשון כדי להתחיל.
          </p>
        ) : (
          courses.map(([course, courseProjects]) => (
            <div key={course} className="rounded-2xl border border-ink/20 overflow-hidden bg-paper/50">
              <button
                onClick={() => setExpandedCourses(prev => ({ ...prev, [course]: !isExpanded(course) }))}
                className={`w-full text-right px-3.5 py-2.5 font-bold text-sm flex items-center justify-between gap-2 transition-colors hover:bg-ink/5 ${isExpanded(course) ? 'border-b border-ink/10' : ''}`}
              >
                <span className="flex items-center gap-2 truncate text-ink">
                  <IconFolder className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate">{course}</span>
                  <span className="text-[10px] font-bold text-ink/40">({courseProjects.length})</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-ink/50 transition-transform duration-200 shrink-0 ${isExpanded(course) ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {isExpanded(course) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {courseProjects.map(p => (
                      <div
                        key={p.id}
                        onClick={() => { onSelect(p.id); onClose(); }}
                        className={`w-full text-right px-3.5 py-3 border-b border-ink/5 last:border-b-0 flex items-center justify-between group cursor-pointer transition-colors ${
                          p.id === activeProjectId ? 'bg-bauhaus-yellow/20' : 'hover:bg-ink/5'
                        }`}
                      >
                        <div className="flex flex-col overflow-hidden">
                          <span className={`text-sm truncate text-ink ${p.id === activeProjectId ? 'font-bold' : 'font-medium'}`}>
                            {p.brief.assignmentName}
                          </span>
                          <span className="text-[10px] text-ink/45 mt-0.5">עודכן לאחרונה: {p.lastActive}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                          className="p-2 text-ink/25 hover:text-bauhaus-red transition-colors shrink-0"
                          title="מחק שיחה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ConversationsDrawer(props: ConversationsDrawerProps) {
  const { open, onClose } = props;
  // Ignore backdrop clicks right after opening (double-tap / synthetic trailing clicks)
  const openedAtRef = React.useRef(0);
  React.useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };
  return (
    <>
      {/* Docked panel on large screens */}
      <aside className="hidden lg:flex w-80 shrink-0 border-l border-ink/15 h-full glass-strong">
        <div className="w-full"><DrawerContent {...props} showClose={false} /></div>
      </aside>

      {/* Overlay drawer on mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            onClick={handleBackdropClick}
          >
            <motion.div
              layoutId="conversations-morph"
              className="absolute top-2 bottom-2 right-2 w-[86%] max-w-sm glass-strong border border-ink/20 overflow-hidden shadow-xl shadow-ink/20"
              style={{ borderRadius: 26 }}
              exit={{ opacity: 0, transition: { duration: 0.32 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.7 }}
              onDragEnd={(_e, info) => {
                // Swipe right closes the right drawer
                if (info.offset.x > 90 || info.velocity.x > 500) onClose();
              }}
              onClick={e => e.stopPropagation()}
            >
              <motion.div
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.18 }}
              >
                <DrawerContent {...props} showClose={true} />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
