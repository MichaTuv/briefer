import React from 'react';
import { motion } from 'motion/react';

// Boot splash: the trio assembles, the wordmark lands between brackets,
// then the whole screen fades into the app.
export function SplashScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center gap-7"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
      aria-hidden
    >
      {/* The trio assembles */}
      <div className="flex items-center gap-3">
        <motion.span
          className="w-9 h-9 rounded-full bg-bauhaus-red"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 18 }}
        />
        <motion.span
          className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[31px] border-l-transparent border-r-transparent border-b-bauhaus-blue"
          initial={{ scale: 0, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 18 }}
        />
        <motion.span
          className="w-9 h-9 bg-bauhaus-yellow"
          initial={{ scale: 0, opacity: 0, rotate: 45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 400, damping: 18 }}
        />
      </div>

      {/* Wordmark between brackets */}
      <div className="flex items-baseline gap-2" dir="ltr">
        <motion.span
          className="text-3xl font-light text-ink/40"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.65, duration: 0.3 }}
        >
          [
        </motion.span>
        <motion.h1
          className="text-3xl font-bold tracking-tight uppercase text-ink"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.35, ease: 'easeOut' }}
        >
          Briefer
        </motion.h1>
        <motion.span
          className="text-3xl font-light text-ink/40"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.65, duration: 0.3 }}
        >
          ]
        </motion.span>
      </div>
    </motion.div>
  );
}
