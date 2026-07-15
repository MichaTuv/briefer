import React from 'react';
import { motion } from 'motion/react';
import { ChecklistItem } from '../types';
import { StepNode } from './icons';

interface ProgressBarProps {
  checklist: ChecklistItem[];
  minimized?: boolean;
  onOpenRoadmap: () => void;
}

// Floating glass pill hovering over the viewport: geometric station dots,
// the current stage name, and a tap-through to the full roadmap.
// In immersive (minimized) mode it shrinks to dots only.
export function ProgressBar({ checklist, minimized, onOpenRoadmap }: ProgressBarProps) {
  if (checklist.length === 0) return null;

  const activeIdx = checklist.findIndex(i => !i.completed && !i.skipped);
  const skippedCount = checklist.filter(i => i.skipped && !i.completed).length;
  const allDone = checklist.length > 0 && checklist.every(i => i.completed);
  // No open steps but skipped ones remain → the first skipped step is "current"
  const firstSkippedIdx = checklist.findIndex(i => i.skipped && !i.completed);
  const currentIdx = activeIdx !== -1 ? activeIdx : (firstSkippedIdx !== -1 ? firstSkippedIdx : checklist.length - 1);
  const currentItem = checklist[currentIdx];
  const onlySkippedLeft = activeIdx === -1 && !allDone && skippedCount > 0;

  return (
    <motion.button
      layoutId="roadmap-morph"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ default: { type: 'tween', duration: 0.32, ease: [0.22, 1, 0.36, 1] }, layout: { type: 'spring', stiffness: 520, damping: 38 } }}
      onClick={onOpenRoadmap}
      className={`pointer-events-auto glass-strong border border-ink/20 flex items-center shadow-lg shadow-ink/10 active:scale-[0.98] ${
        minimized ? 'px-3.5 py-2.5 gap-0' : 'pl-5 pr-4 py-2.5 gap-3 max-w-full'
      }`}
      style={{ borderRadius: 999 }}
      aria-label="פתח מפת דרכים מלאה"
      dir="rtl"
    >
      {/* Station nodes — same shape language as the expanded roadmap, strung on a
          progress track that fills (right-to-left) up to the current node */}
      <span className="relative flex items-center gap-1.5 shrink-0" aria-hidden>
        {/* Track runs between the node centers — never past the end nodes */}
        <span className="absolute top-1/2 -translate-y-1/2 right-[6px] left-[6px] h-[2px]">
          <span className="absolute inset-0 bg-ink/15 rounded-full" />
          <span
            className="absolute right-0 top-0 h-full bg-bauhaus-red rounded-full transition-all duration-500"
            style={{ width: `${allDone ? 100 : Math.round((currentIdx / Math.max(1, checklist.length - 1)) * 100)}%` }}
          />
        </span>
        {checklist.map((item, i) => {
          const status = item.completed
            ? 'done' as const
            : item.skipped
              ? 'skipped' as const
              : i === currentIdx && !allDone
                ? 'current' as const
                : 'open' as const;
          return (
            <motion.span
              key={item.id}
              initial={false}
              animate={{ scale: status === 'current' ? 1.25 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="relative z-10 flex items-center justify-center"
            >
              <StepNode status={status} size={status === 'open' ? 9 : 12} />
            </motion.span>
          );
        })}
      </span>

      {/* Current station (hidden in immersive mode — dots only) */}
      {!minimized && (
      <span className="flex flex-col items-start min-w-0 text-right">
        <span className="text-[13px] font-bold text-ink truncate w-full leading-tight">
          {allDone ? 'כל השלבים הושלמו! 🎉' : onlySkippedLeft ? `בהמתנה: ${currentItem.title}` : currentItem.title}
        </span>
        <span className="text-[10px] text-ink/50 leading-tight">
          תחנה {currentIdx + 1} מתוך {checklist.length}
          {skippedCount > 0 && <span className="text-bauhaus-yellow font-bold"> • {skippedCount} בהמתנה</span>}
        </span>
      </span>
      )}
    </motion.button>
  );
}
