import { useRef } from 'react';

// Phone-like mouse drag-to-scroll for a scrollable container.
// Touch devices scroll natively; this covers mouse/trackpad dragging.
// A small movement threshold keeps click/text-selection behavior intact.
export function useDragScroll(scrollRef: React.RefObject<HTMLElement | null>) {
  const dragRef = useRef({ startY: 0, startTop: 0, active: false, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startTop: el.scrollTop, active: true, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d.active || !el) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    }
    el.scrollTop = d.startTop - dy;
    e.preventDefault();
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
    dragRef.current.moved = false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp };
}
