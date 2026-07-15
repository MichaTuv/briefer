import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Mic, Loader2 } from 'lucide-react';
import { IconSend } from './icons';
import { useDragScroll } from '../hooks/useDragScroll';
import { ChatMessage } from '../types';

interface ChatOverlayProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => void;
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isAgent = msg.role === 'assistant';
  return (
    <div className={`flex w-full ${isAgent ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words transition-opacity ${
          isAgent
            ? 'bg-paper text-ink border border-ink/15 rounded-tl-2xl rounded-bl-2xl rounded-br-2xl rounded-tr-md shadow-sm'
            : 'bg-ink text-canvas rounded-tr-2xl rounded-br-2xl rounded-bl-2xl rounded-tl-md'
        } ${msg.pending ? 'opacity-60' : ''}`}
      >
        {msg.content}
        <div className={`flex items-center gap-1 mt-1 text-[10px] ${isAgent ? 'text-ink/40' : 'text-canvas/60'}`}>
          {msg.source === 'voice' && <Mic className="w-2.5 h-2.5" />}
          <span>{msg.timestamp}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatOverlay({ open, onClose, messages, sending, onSend }: ChatOverlayProps) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) {
      wasOpenRef.current = open;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    // Pin to the newest message on open; afterwards only follow new messages
    // if the user is already near the bottom — never fight their scrolling
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (justOpened || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText('');
  };

  const dragScroll = useDragScroll(scrollRef);
  const dragControls = useDragControls();

  // Ignore backdrop clicks right after opening (double-tap / synthetic trailing clicks)
  const openedAtRef = useRef(0);
  useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/25 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          onClick={handleBackdropClick}
          dir="rtl"
        >
          {/* Expands from the chat icon (shared layoutId morph) into a floating card.
              Close: tap outside, tap the title, or swipe down from the header. */}
          <motion.div
            layoutId="chat-morph"
            className="pointer-events-auto flex flex-col glass-strong border border-ink/20 mx-2 mb-2 h-[72%] overflow-hidden shadow-xl shadow-ink/20"
            style={{ borderRadius: 26 }}
            exit={{ opacity: 0, transition: { duration: 0.32 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            onClick={e => e.stopPropagation()}
            onLayoutAnimationComplete={() => {
              // Focus only after the morph finished — focusing mid-animation causes jank
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b border-ink/15 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <h3
                onClick={onClose}
                role="button"
                aria-label="סגור שיחה"
                className="font-bold text-sm text-ink flex items-center gap-2 cursor-pointer"
              >
                <span className="w-2.5 h-2.5 bg-bauhaus-red rounded-full inline-block" aria-hidden />
                השיחה ({messages.length})
              </h3>
            </div>

            <div
              ref={scrollRef}
              {...dragScroll}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-2.5 cursor-grab active:cursor-grabbing"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center mt-8 gap-3">
                  <span className="flex items-center gap-1.5 opacity-60" aria-hidden>
                    <span className="w-2.5 h-2.5 rounded-full bg-bauhaus-red" />
                    <span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[9px] border-l-transparent border-r-transparent border-b-bauhaus-blue" />
                    <span className="w-2.5 h-2.5 bg-bauhaus-yellow" />
                  </span>
                  <p className="text-sm text-ink/40 text-center">עוד אין הודעות — התחל לדבר עם המנטור או כתוב כאן.</p>
                </div>
              ) : (
                messages.map(msg => <Bubble key={msg.id} msg={msg} />)
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2.5 border-t border-ink/15 shrink-0 pb-safe">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={sending}
                placeholder="כתוב למנטור…"
                className="flex-1 h-11 rounded-full border border-ink/25 bg-paper px-4 text-sm text-ink outline-none focus:border-ink transition-colors min-w-0 placeholder-ink/35"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="w-11 h-11 rounded-full bg-ink text-canvas flex items-center justify-center active:scale-95 transition-transform shrink-0 disabled:opacity-30"
                aria-label="שלח הודעה"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSend className="w-[18px] h-[18px]" />}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
