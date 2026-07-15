import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'motion/react';
import { X, Check, Trash2, SkipForward, ChevronDown, MoreVertical } from 'lucide-react';
import { IconPlus, StepNode } from './icons';
import { AnimatePresence } from 'motion/react';
import { Project } from '../types';
import { useDragScroll } from '../hooks/useDragScroll';

interface RoadmapViewProps {
  project: Project;
  onClose: () => void;
  onToggleStep: (stepId: string) => void;
  onToggleSkip: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStep: (title: string, phase: string) => void;
}

const PHASES = [
  { id: 'research', label: 'מחקר ולימוד' },
  { id: 'ideation', label: 'פיתוח רעיון' },
  { id: 'planning', label: 'תכנון ולו"ז' },
  { id: 'execution', label: 'ביצוע ועיצוב' },
  { id: 'review', label: 'בדיקה והגהה' }
];

// Bottom-sheet card: covers most (not all) of the screen, glass over a blurred
// backdrop, draggable down to dismiss from its top grab area.
export function RoadmapView({ project, onClose, onToggleStep, onToggleSkip, onDeleteStep, onAddStep }: RoadmapViewProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newPhase, setNewPhase] = useState('ideation');
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const dragControls = useDragControls();
  const listRef = useRef<HTMLDivElement>(null);
  const dragScroll = useDragScroll(listRef);

  // Ignore backdrop clicks right after opening (double-tap / synthetic trailing clicks)
  const openedAtRef = useRef(Date.now());
  useEffect(() => { openedAtRef.current = Date.now(); }, []);
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };

  const checklist = project.checklist;
  const completedCount = checklist.filter(i => i.completed).length;
  const activeIdx = checklist.findIndex(x => !x.completed && !x.skipped);
  const currentIdx = activeIdx === -1 ? checklist.length - 1 : activeIdx;

  const phaseLabel = (phase: string) => PHASES.find(p => p.id === phase)?.label || phase;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddStep(newTitle.trim(), newPhase);
    setNewTitle('');
    setAddOpen(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      onClick={handleBackdropClick}
      dir="rtl"
    >
      {/* Floating modal: expands from the pill's exact spot downward, hovers above
          the bottom of the screen. Swipe UP from its bottom handle to close. */}
      <motion.div
        layoutId="roadmap-morph"
        className="absolute inset-x-3 glass-strong border border-ink/20 flex flex-col overflow-hidden shadow-xl shadow-ink/20"
        style={{ borderRadius: 26, top: 'calc(env(safe-area-inset-top) + 4.75rem)', bottom: '6rem' }}
        exit={{ opacity: 0, transition: { duration: 0.32 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.7, bottom: 0 }}
        onDragEnd={(_e, info) => {
          if (info.offset.y < -90 || info.velocity.y < -500) onClose();
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — tapping the title collapses the modal back into the pill */}
        <div className="shrink-0 select-none cursor-pointer" onClick={onClose} role="button" aria-label="סגור מפת דרכים">
          <div className="px-5 pt-4 pb-3 flex justify-between items-center">
            <h2 className="font-bold text-lg text-ink flex items-center gap-2.5">
              <span className="flex items-center gap-1" aria-hidden>
                <span className="w-2.5 h-2.5 rounded-full bg-bauhaus-red inline-block" />
                <span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[9px] border-l-transparent border-r-transparent border-b-bauhaus-blue inline-block" />
                <span className="w-2.5 h-2.5 bg-bauhaus-yellow inline-block" />
              </span>
              מפת דרכים
              <span className="text-sm text-ink/50 font-normal">
                ({Math.min(checklist.length, completedCount + 1)} מתוך {checklist.length})
              </span>
            </h2>
          </div>
          <div className="border-b border-ink/10" />
        </div>

        <div
          ref={listRef}
          {...dragScroll}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 !pb-44 cursor-grab active:cursor-grabbing"
        >
          <div className="max-w-xl mx-auto">
            <div className="space-y-5 relative mx-1">
              {/* Vertical progress rails */}
              <div className="absolute right-[19px] top-8 bottom-8 w-[2px] bg-ink/20 z-0" />
              <div
                className="absolute right-[19px] top-8 bottom-8 w-[4px] bg-bauhaus-blue z-0 origin-top transition-transform duration-500 ease-out"
                style={{ transform: `scaleY(${Math.min(1, Math.max(0, currentIdx / Math.max(1, checklist.length - 1)))})` }}
              />

              {checklist.map((item, i) => {
                const isCurrent = i === currentIdx && !item.completed && !item.skipped;
                const isSkipped = !!item.skipped;
                return (
                  <div key={item.id} className="relative z-10 flex items-start gap-4">
                    <div className="relative flex flex-col items-center mt-3 shrink-0">
                      {/* Same node language as the pill: red diamond / blue circle / yellow triangle */}
                      <button
                        onClick={() => onToggleStep(item.id)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center z-10 active:scale-90 transition-transform ${
                          item.completed || isSkipped ? '' : 'bg-paper'
                        }`}
                        aria-label={item.completed ? 'בטל סימון שלב' : 'סמן שלב כהושלם'}
                      >
                        <StepNode
                          status={item.completed ? 'done' : isSkipped ? 'skipped' : isCurrent ? 'current' : 'open'}
                          size={item.completed ? 30 : 34}
                          label={String(i + 1)}
                          outlined
                        />
                      </button>
                    </div>

                    <div
                      className={`flex-1 min-w-0 rounded-2xl border relative transition-all duration-300 bg-paper/70 ${
                        item.completed
                          ? 'opacity-55 border-ink/20'
                          : isSkipped
                            ? 'border-bauhaus-yellow/70 opacity-85'
                            : isCurrent
                              ? 'border-bauhaus-blue shadow-lg shadow-bauhaus-blue/15'
                              : 'border-ink/20'
                      }`}
                    >
                      {/* Collapsed: title only. Tapping expands to the full description. */}
                      <div className="flex items-center gap-1.5 p-3">
                        <button
                          onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-right"
                          aria-expanded={expandedId === item.id}
                        >
                          <p className={`flex-1 min-w-0 font-bold text-base leading-tight truncate ${item.completed ? 'line-through text-ink/40' : 'text-ink'}`}>
                            {item.title}
                          </p>
                          <motion.span
                            animate={{ rotate: expandedId === item.id ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-ink/35 shrink-0"
                            aria-hidden
                          >
                            <ChevronDown className="w-4.5 h-4.5" />
                          </motion.span>
                        </button>

                        {/* Three-dot menu: skip / delete, opens as a glass popover below */}
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                            className={`p-1.5 rounded-full transition-colors ${menuOpenId === item.id ? 'bg-ink/10 text-ink' : 'text-ink/35 hover:text-ink hover:bg-ink/5'}`}
                            aria-label="אפשרויות שלב"
                            aria-expanded={menuOpenId === item.id}
                          >
                            <MoreVertical className="w-4.5 h-4.5" />
                          </button>
                          <AnimatePresence>
                            {menuOpenId === item.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.12 } }}
                                transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
                                className="absolute left-0 top-full mt-1 z-30 glass-strong rounded-xl border border-ink/15 shadow-lg shadow-ink/20 overflow-hidden min-w-40"
                              >
                                <button
                                  onClick={() => { onToggleSkip(item.id); setMenuOpenId(null); }}
                                  className="w-full text-right px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5 flex items-center gap-2 transition-colors"
                                >
                                  <SkipForward className="w-4 h-4 text-bauhaus-yellow" />
                                  {isSkipped ? 'החזר למסלול' : 'דלג לבינתיים'}
                                </button>
                                <div className="border-t border-ink/10" />
                                <button
                                  onClick={() => { onDeleteStep(item.id); setMenuOpenId(null); }}
                                  className="w-full text-right px-3.5 py-2.5 text-sm font-medium text-bauhaus-red hover:bg-bauhaus-red/10 flex items-center gap-2 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  מחק שלב
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {expandedId === item.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <div className="px-3.5 pb-3.5 pt-0.5 border-t border-ink/10">
                              <span className={`text-[10px] font-bold uppercase tracking-wider mt-2 mb-1 block ${isCurrent ? 'text-bauhaus-blue' : isSkipped ? 'text-bauhaus-yellow' : 'text-ink/40'}`}>
                                שלב {i + 1} • {phaseLabel(item.phase)}
                                {isSkipped && ' • דילגת — נחזור לזה'}
                              </span>
                              <p className="text-sm leading-relaxed text-ink/65 break-words">{item.description}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Invisible grab zone at the bottom edge — swipe up here to close */}
        <div
          className="shrink-0 h-9 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={(e) => dragControls.start(e)}
          aria-label="החלק למעלה לסגירה"
        />

        {/* Floating "add stop" — hovers over the card content */}
        <AnimatePresence mode="wait">
          {addOpen ? (
            <motion.form
              key="form"
              onSubmit={handleAdd}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              className="absolute bottom-14 inset-x-4 z-20 glass-strong rounded-2xl border border-ink/20 p-3 flex flex-col gap-2.5 shadow-lg shadow-ink/15"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink/60 uppercase tracking-wider">תחנה חדשה</span>
                <button type="button" onClick={() => setAddOpen(false)} className="p-1 rounded-full text-ink/50 hover:bg-ink/5" aria-label="בטל">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="שם התחנה החדשה..."
                autoFocus
                className="w-full rounded-xl border border-ink/25 bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:border-ink transition-colors placeholder-ink/35"
              />
              <div className="flex gap-2">
                <select
                  value={newPhase}
                  onChange={e => setNewPhase(e.target.value)}
                  className="flex-1 rounded-xl border border-ink/25 bg-paper px-3 py-2.5 text-sm font-bold text-ink outline-none"
                >
                  {PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="rounded-full bg-bauhaus-blue text-white font-bold text-sm px-6 py-2.5 active:scale-95 transition-transform disabled:opacity-40"
                >
                  הוסף
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.button
              key="fab"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0, transition: { duration: 0.12 } }}
              onClick={() => setAddOpen(true)}
              className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 rounded-full bg-bauhaus-blue text-white font-bold text-sm pl-5 pr-4 py-3 flex items-center gap-2 shadow-lg shadow-ink/25 active:scale-95 transition-transform"
              aria-label="הוסף תחנה חדשה"
            >
              <IconPlus className="w-4 h-4" />
              תחנה חדשה
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
