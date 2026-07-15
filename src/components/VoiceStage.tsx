import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'paused';

interface VoiceStageProps {
  state: VoiceState;
  disabled?: boolean;
  onToggle: () => void;
  getInputLevel?: () => number;
  getOutputLevel?: () => number;
}

// Each label names the state AND what pressing the red circle will do
const stateLabels: Record<VoiceState, string> = {
  idle: 'השיחה עוד לא התחילה — הקש על העיגול האדום כדי להתחיל',
  connecting: 'טוען…',
  listening: 'מקשיב לך — הקש על העיגול האדום כדי להשהות את השיחה',
  speaking: 'המנטור מדבר — הקש על העיגול האדום כדי להשהות את השיחה',
  paused: 'השיחה בהפסקה — הקש על העיגול האדום כדי להמשיך'
};

// Listening: sound-wave lines running behind the button, rippling with the
// user's voice. They enter softly and animate out when listening ends.
const WAVE_W = 360;
const WAVE_H = 110;
const WAVE_LINES = [
  { amp: 1, k: 0.05, speed: 3.2, phase: 0, stroke: 'var(--color-bauhaus-red)', width: 2, opacity: 0.45 },
  { amp: 0.62, k: 0.065, speed: 4.1, phase: 1.9, stroke: 'currentColor', width: 1.6, opacity: 0.22 },
  { amp: 0.38, k: 0.035, speed: 2.4, phase: 3.7, stroke: 'currentColor', width: 1.3, opacity: 0.13 }
];

function ListeningWaves({ getInputLevel }: { getInputLevel?: () => number }) {
  const pathsRef = useRef<Array<SVGPathElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    let t = 0;
    const mid = WAVE_H / 2;
    const loop = () => {
      const level = getInputLevel ? getInputLevel() : 0;
      t += 1 / 60;
      WAVE_LINES.forEach((line, i) => {
        const el = pathsRef.current[i];
        if (!el) return;
        const amp = (1.5 + level * 30) * line.amp;
        let d = '';
        for (let x = 0; x <= WAVE_W; x += 7) {
          const y = mid + amp * Math.sin(x * line.k + t * line.speed + line.phase);
          d += (x === 0 ? `M${x} ${y.toFixed(1)}` : ` L${x} ${y.toFixed(1)}`);
        }
        el.setAttribute('d', d);
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [getInputLevel]);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
      {/* Threads exhale out of the button when listening starts (the key
          speaking→listening handover) and get pulled back in when it ends */}
      <motion.div
        className="text-ink [filter:blur(0.7px)]"
        initial={{ opacity: 0, scaleX: 0.08, scaleY: 0.5 }}
        animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleX: 0.06, scaleY: 0.35, transition: { duration: 0.32, ease: 'easeIn' } }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg width={WAVE_W} height={WAVE_H} viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}>
          {WAVE_LINES.map((line, i) => (
            <path
              key={i}
              ref={el => { pathsRef.current[i] = el; }}
              stroke={line.stroke}
              strokeWidth={line.width}
              opacity={line.opacity}
              fill="none"
              strokeLinecap="round"
            />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}

// Speaking: soft blurred halo behind the button, breathing with the mentor's voice.
function SpeakingPulse({ getOutputLevel }: { getOutputLevel?: () => number }) {
  const discRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const loop = () => {
      const level = getOutputLevel ? getOutputLevel() : 0;
      // Slow lerp so the breathing feels soft, never sharp
      smooth += (level - smooth) * 0.07;
      const el = discRef.current;
      if (el) {
        const scale = 1.005 + smooth * 0.09;
        el.style.transform = `translateY(6px) scale(${scale.toFixed(3)})`;
        el.style.opacity = (smooth * 0.3).toFixed(3);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [getOutputLevel]);

  return (
    <span
      ref={discRef}
      className="absolute inset-0 rounded-full bg-bauhaus-red/40 dark:bg-ink/35 blur-md pointer-events-none"
      style={{ transform: 'translateY(6px)', opacity: 0 }}
      aria-hidden
    />
  );
}

// Thinking / loading: the app's three motifs escape from behind the button
// and dissolve into the background, staggered on a loop.
const MOTIFS = [
  { key: 'square', x: 78, y: -88, el: <span className="block w-8 h-8 bg-bauhaus-yellow" /> },
  { key: 'triangle', x: -104, y: -26, el: <span className="block w-0 h-0 border-l-[19px] border-r-[19px] border-b-[33px] border-l-transparent border-r-transparent border-b-bauhaus-blue" /> },
  { key: 'circle', x: 52, y: 96, el: <span className="block w-9 h-9 rounded-full bg-bauhaus-red" /> }
];

function ThinkingMotifs() {
  return (
    <>
      {MOTIFS.map((m, i) => (
        <motion.span
          key={m.key}
          className="absolute left-1/2 top-1/2 -ml-4 -mt-4 pointer-events-none"
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 0, rotate: 0 }}
          animate={{ x: m.x, y: m.y, scale: 1.1, opacity: [0, 0.9, 0], rotate: i === 0 ? 45 : 0 }}
          transition={{ duration: 1.9, repeat: Infinity, delay: i * 0.55, ease: 'easeOut' }}
          aria-hidden
        >
          {m.el}
        </motion.span>
      ))}
    </>
  );
}

// Detects the "thinking" moment during a live session: the user spoke, went
// quiet, and the mentor hasn't started answering yet → show a loading state.
function useThinking(active: boolean, getInputLevel?: () => number): boolean {
  const [thinking, setThinking] = useState(false);
  const thinkingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      thinkingRef.current = false;
      setThinking(false);
      return;
    }
    let raf = 0;
    let spoke = false;
    let lastSpeech = performance.now();
    const loop = () => {
      const level = getInputLevel ? getInputLevel() : 0;
      const now = performance.now();
      if (level > 0.12) {
        spoke = true;
        lastSpeech = now;
      }
      const shouldThink = spoke && now - lastSpeech > 900;
      if (shouldThink !== thinkingRef.current) {
        thinkingRef.current = shouldThink;
        setThinking(shouldThink);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [active, getInputLevel]);

  return thinking;
}

// The main button IS the red circle of the app's circle-square-triangle trio.
// Same design language as the app's action buttons: solid flat accent, hard
// ink offset shadow, physical press.
export function VoiceStage({ state, disabled, onToggle, getInputLevel, getOutputLevel }: VoiceStageProps) {
  const thinking = useThinking(state === 'listening', getInputLevel);
  const showWaves = state === 'listening' && !thinking;
  const showThinking = state === 'connecting' || (state === 'listening' && thinking);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Speaking: the button itself breathes with the mentor's voice — a whisper of
  // scale (≤3%), heavily smoothed so it feels soft and satisfying.
  useEffect(() => {
    const el = buttonRef.current;
    if (state !== 'speaking') {
      if (el) el.style.transform = '';
      return;
    }
    let raf = 0;
    let smooth = 0;
    const loop = () => {
      const level = getOutputLevel ? getOutputLevel() : 0;
      smooth += (level - smooth) * 0.055;
      if (buttonRef.current) {
        buttonRef.current.style.transform = `scale(${(1 + smooth * 0.028).toFixed(4)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      if (buttonRef.current) buttonRef.current.style.transform = '';
    };
  }, [state, getOutputLevel]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 select-none">
      <div className="relative flex items-center justify-center w-56 h-56">
        {/* Behind-the-button layer */}
        <AnimatePresence>
          {showWaves && <ListeningWaves key="waves" getInputLevel={getInputLevel} />}
        </AnimatePresence>
        <div className="absolute inset-4">
          {state === 'speaking' && <SpeakingPulse getOutputLevel={getOutputLevel} />}
        </div>
        {/* Thinking motifs bloom out just after the threads retract, and are
            swallowed back into the button when thinking ends */}
        <AnimatePresence>
          {showThinking && (
            <motion.div
              key="thinking"
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1, transition: { delay: 0.14, duration: 0.3, ease: 'easeOut' } }}
              exit={{ opacity: 0, scale: 0.65, transition: { duration: 0.22, ease: 'easeIn' } }}
            >
              <ThinkingMotifs />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          ref={buttonRef}
          onClick={onToggle}
          disabled={disabled}
          className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center transition-colors duration-300 border border-white/75 shadow-lg shadow-ink/15 ${
            disabled
              ? 'bg-ink/20 cursor-not-allowed'
              : state === 'idle' || state === 'paused'
                // Paused material: softer translucent glass-red — clearly "on hold"
                ? 'glass-red active:scale-[0.97]'
                // Live material: solid, saturated red
                : 'bg-bauhaus-red active:scale-[0.97]'
          }`}
          aria-label={stateLabels[state]}
        >
          {showThinking ? (
            // Mini motif trio pulsing while the mentor thinks
            <motion.div
              className="flex items-center gap-2.5"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.25, ease: 'easeOut' }}
            >
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                >
                  {i === 0 && <span className="block w-3.5 h-3.5 rounded-full bg-white" />}
                  {i === 1 && <span className="block w-0 h-0 border-l-[8px] border-r-[8px] border-b-[14px] border-l-transparent border-r-transparent border-b-white" />}
                  {i === 2 && <span className="block w-3.5 h-3.5 bg-white" />}
                </motion.span>
              ))}
            </motion.div>
          ) : state === 'listening' ? (
            // Empty — the waves behind the button carry the state
            null
          ) : (
            // Idle / paused / listening / speaking: a clean empty circle —
            // the bottom label describes the interaction
            null
          )}
        </button>
      </div>

      {/* Same voice as the course label in the header: small, thin, airy gray */}
      <p className={`absolute bottom-24 inset-x-16 text-[10px] leading-snug tracking-widest text-center transition-colors duration-300 ${
        disabled ? 'text-ink/35' : 'text-ink/50'
      }`}>
        {disabled
          ? 'העלה בריף כדי להתחיל'
          : state === 'listening' && thinking
            ? 'המנטור חושב…'
            : stateLabels[state]}
      </p>
    </div>
  );
}
