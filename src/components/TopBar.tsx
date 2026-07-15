import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Project } from '../types';
import { IconFolder, IconNote } from './icons';

interface TopBarProps {
  project?: Project;
  minimized: boolean;
  conversationsOpen: boolean;
  notesOpen: boolean;
  onOpenConversations: () => void;
  onOpenNotes: () => void;
}

export function TopBar({ project, minimized, conversationsOpen, notesOpen, onOpenConversations, onOpenNotes }: TopBarProps) {
  return (
    <header className="absolute top-0 inset-x-0 z-30 pointer-events-none">
      {/* Title container — glass, bottom edge fades into transparency */}
      <AnimatePresence>
        {!minimized && (
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18, transition: { duration: 0.55, ease: 'easeIn' } }}
            transition={{ type: 'tween', duration: 0.55, ease: 'easeOut' }}
            className="glass px-16 pb-8 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            <div className="text-center min-w-0">
              {project ? (
                <>
                  <span className="text-[10px] text-ink/50 uppercase tracking-widest truncate block">{project.brief.courseName}</span>
                  <h1 className="font-bold text-ink truncate text-base leading-tight">
                    {project.brief.assignmentName}
                  </h1>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 py-1">
                  <span className="flex items-center gap-1" aria-hidden>
                    <span className="w-3 h-3 rounded-full bg-bauhaus-red inline-block" />
                    <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[11px] border-l-transparent border-r-transparent border-b-bauhaus-blue inline-block" />
                    <span className="w-3 h-3 bg-bauhaus-yellow inline-block" />
                  </span>
                  <h1 className="font-bold text-xl tracking-tight uppercase leading-none text-ink">Briefer</h1>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corner icons — always present, low visual weight when minimized.
          Each morphs into its drawer (shared layoutId), so it hides while open. */}
      {!conversationsOpen && (
        <motion.button
          layoutId="conversations-morph"
          onClick={onOpenConversations}
          animate={{ opacity: minimized ? 0.38 : 1 }}
          transition={{ opacity: { duration: 0.65 }, layout: { type: 'spring', stiffness: 520, damping: 38 } }}
          className="lg:hidden pointer-events-auto absolute right-3 top-3 w-11 h-11 glass-strong border border-ink/20 flex items-center justify-center text-ink shadow-sm active:scale-95"
          style={{ marginTop: 'env(safe-area-inset-top)', borderRadius: 999 }}
          aria-label="השיחות שלי"
        >
          <IconFolder className="w-[22px] h-[22px]" />
        </motion.button>
      )}
      {!notesOpen && (
        <motion.button
          layoutId="notes-morph"
          onClick={onOpenNotes}
          disabled={!project}
          animate={{ opacity: minimized ? 0.38 : project ? 1 : 0.3 }}
          transition={{ opacity: { duration: 0.65 }, layout: { type: 'spring', stiffness: 520, damping: 38 } }}
          className="lg:hidden pointer-events-auto absolute left-3 top-3 w-11 h-11 glass-strong border border-ink/20 flex items-center justify-center text-ink shadow-sm active:scale-95 disabled:cursor-not-allowed"
          style={{ marginTop: 'env(safe-area-inset-top)', borderRadius: 999 }}
          aria-label="פתקים"
        >
          <IconNote className="w-[22px] h-[22px]" />
        </motion.button>
      )}
    </header>
  );
}
