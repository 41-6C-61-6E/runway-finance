'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Edge-fade affordance for horizontal scrollers.
 *
 * The single shared indicator that a pill row / capsule / chip strip is
 * scrollable or draggable: a soft glass-colored gradient at each clipped
 * edge, shown only on the sides where content continues. Change the look
 * once here and every faded scroller updates in unison.
 *
 * Usage:
 *   const { fadeRef, fades } = useScrollFades();
 *   <div className="relative">
 *     <div ref={fadeRef} className="overflow-x-auto no-scrollbar ...">
 *       ...items...
 *     </div>
 *     <ScrollFadeOverlays side={fades} />
 *   </div>
 *
 * The overlays must be siblings of the scroller (not children) so they are
 * not clipped by `overflow`, and the outer wrapper needs `relative`.
 */
const FADE_MARGIN = 4;

export interface ScrollFades {
  left: boolean;
  right: boolean;
}

export function useScrollFades<T extends HTMLElement = HTMLDivElement>() {
  const fadeRef = React.useRef<T>(null);
  const [fades, setFades] = React.useState<ScrollFades>({ left: false, right: false });

  const update = React.useCallback(() => {
    const el = fadeRef.current;
    if (!el) return;
    const left = el.scrollLeft > FADE_MARGIN;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - FADE_MARGIN;
    setFades((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  React.useLayoutEffect(() => {
    update();
    const el = fadeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [update]);

  return { fadeRef, fades, update };
}

interface ScrollFadeOverlaysProps extends ScrollFades {
  className?: string;
}

/**
 * One fade edge.
 *
 * The wrapper is the capsule's exact outline (`inset-0 rounded-full`) with a
 * linear mask that cuts the gradient off before it reaches the far side —
 * so the fade stays contained inside the rounded envelope. On top of the
 * fade, a slim light "glow" line marks the clipped edge so the swipable
 * direction reads instantly, even on very wide strips where the gradient
 * alone is a subtle tint.
 */
function FadeEdge({ side, visible, className }: { side: 'left' | 'right'; visible: boolean; className?: string }) {
  const isLeft = side === 'left';
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-full transition-opacity duration-200',
        isLeft
          ? '[mask-image:linear-gradient(to_right,black,transparent_100px)]'
          : '[mask-image:linear-gradient(to_left,black,transparent_100px)]',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 w-12',
          isLeft
            ? 'left-0 bg-gradient-to-r from-foreground/20 via-foreground/5 to-transparent'
            : 'right-0 bg-gradient-to-l from-foreground/20 via-foreground/5 to-transparent'
        )}
      />
      <div
        className={cn(
          'absolute inset-y-2 w-px bg-gradient-to-b from-transparent via-foreground/35 to-transparent',
          isLeft ? 'left-0' : 'right-0'
        )}
      />
    </div>
  );
}

export function ScrollFadeOverlays({ left, right, className }: ScrollFadeOverlaysProps) {
  return (
    <>
      <FadeEdge side="left" visible={left} className={className} />
      <FadeEdge side="right" visible={right} className={className} />
    </>
  );
}
