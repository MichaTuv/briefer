import React from 'react';

// Custom Bauhaus icon set: monochrome, elementary geometry, sharp corners,
// square caps. Character comes from shape language — not color accents.

interface IconProps {
  className?: string;
}

// Conversations: flat geometric folder — sharp corners, angled tab
export function IconFolder({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3.5 6.5h6l2 2.5h9V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="miter"
      />
      <path d="M3.5 12.5h17" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// Notes: sharp page, solid folded corner, square-capped lines
export function IconNote({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5.5 3.5h9L19 8v12.5H5.5v-17z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="miter"
      />
      <path d="M14.5 3.9V8h4.1z" fill="currentColor" />
      <path d="M8.5 12.5h7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <path d="M8.5 16.3h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

// Chat: pure circle with a flat triangle tail — the app's geometry as a glyph
export function IconChat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 16.8 4.6 21.6l6.6-1.9z" fill="currentColor" />
    </svg>
  );
}

// Send (RTL — flies left): a flat folded triangle
export function IconSend({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 12 20 4.5l-3.6 7.5 3.6 7.5z" fill="currentColor" strokeLinejoin="miter" />
    </svg>
  );
}

// Settings: three sliders whose knobs are the circle, square and triangle — monochrome
export function IconSettings({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3.5 6h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" opacity="0.45" />
      <path d="M3.5 12h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" opacity="0.45" />
      <path d="M3.5 18h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" opacity="0.45" />
      <circle cx="9" cy="6" r="2.6" fill="currentColor" />
      <rect x="12.5" y="9.5" width="5" height="5" fill="currentColor" />
      <path d="M10 15.2l3 5.2H7z" fill="currentColor" />
    </svg>
  );
}

// Roadmap step node — ONE source of truth for both the pill and the expanded view:
// red 45°-rotated square = done, blue circle = current, hollow yellow triangle = skipped
export type StepStatus = 'done' | 'current' | 'skipped' | 'open';

export function StepNode({ status, size = 12, label, outlined = false }: { status: StepStatus; size?: number; label?: string; outlined?: boolean }) {
  if (status === 'done') {
    // Rotated square: diagonal = side * √2, so side ≈ size/√2 keeps its visual
    // footprint equal to the circle's diameter
    const side = Math.round(size * 0.72);
    return (
      <span
        className="block bg-bauhaus-red rotate-45 shrink-0"
        style={{
          width: side,
          height: side,
          // Paper ring that follows the square's own shape (expanded view only)
          ...(outlined ? { boxShadow: `0 0 0 ${Math.max(2, Math.round(size * 0.09))}px var(--color-paper)` } : {})
        }}
        aria-hidden
      />
    );
  }
  if (status === 'skipped') {
    // Triangles read smaller than their bounding box — enlarge slightly.
    // Opaque paper fill hides the track line behind it; shifted up a touch so
    // its optical center (centroid, below the box center) sits on the line.
    const t = Math.round(size * 1.1);
    return (
      <svg
        width={t}
        height={t}
        viewBox="0 0 24 24"
        className="shrink-0"
        style={{ transform: `translateY(-${Math.max(1, Math.round(t * 0.09))}px)` }}
        aria-hidden
      >
        {/* Paper halo stroke beneath (expanded view only), yellow stroke on top */}
        {outlined && (
          <path d="M12 4 21 20H3z" stroke="var(--color-paper)" strokeWidth="8" strokeLinejoin="round" fill="var(--color-paper)" />
        )}
        <path d="M12 4 21 20H3z" stroke="var(--color-bauhaus-yellow)" strokeWidth="2.6" strokeLinejoin="round" fill="var(--color-paper)" />
      </svg>
    );
  }
  if (status === 'current') {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-bauhaus-blue text-white font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {label || ''}
      </span>
    );
  }
  // open / future — opaque paper fill so track lines don't show through
  return (
    <span
      className="flex items-center justify-center rounded-full border-2 border-ink/25 bg-paper text-ink/40 font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {label || ''}
    </span>
  );
}

// Plus: chunky square-capped cross
export function IconPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
