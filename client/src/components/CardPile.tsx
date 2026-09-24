/**
 * A face-down stack of captured cards — the pile that grows in front of you
 * every time you beat someone's set. Each card is nudged a little so the
 * stack looks hand-made rather than printed.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Deterministic jitter, so a pile does not reshuffle itself on every render. */
function jitter(i: number) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return {
    rotate: ((a - Math.floor(a)) - 0.5) * 11,
    dx: ((b - Math.floor(b)) - 0.5) * 5,
  };
}

interface Props {
  count: number;
  /** width of one card in px */
  size?: number;
  label?: string;
}

export const CardPile = memo(function CardPile({ count, size = 34, label }: Props) {
  // Past a handful of cards the stack reads as "a stack"; the number carries the rest.
  const shown = Math.min(count, 7);

  return (
    <div className="flex items-center gap-2" title={label}>
      <div
        className="relative shrink-0"
        style={{ width: size + shown * 1.5, height: size * 1.5 + shown * 1.2 }}
        aria-hidden
      >
        <AnimatePresence initial={false}>
          {Array.from({ length: shown }, (_, i) => {
            const j = jitter(i);
            return (
              <motion.div
                key={i}
                className="absolute overflow-hidden rounded-[8%/5.5%] ring-1 ring-ink"
                style={{ width: size, height: size * 1.5, bottom: i * 1.2, left: i * 1.5 }}
                initial={{ opacity: 0, y: -22, scale: 1.25, rotate: j.rotate - 18 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: j.rotate, x: j.dx }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24, delay: i * 0.03 }}
              >
                <img
                  src="/img/card-back.webp"
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
        {count === 0 && (
          <div
            className="absolute inset-0 rounded-[8%/5.5%] border border-dashed border-cream/15"
            style={{ width: size, height: size * 1.5 }}
          />
        )}
      </div>

      <motion.span
        key={count}
        initial={{ scale: 1.4, color: '#d4a557' }}
        animate={{ scale: 1, color: 'rgba(236,231,221,0.85)' }}
        className="display text-sm font-extrabold tabular-nums"
      >
        {count}
      </motion.span>
    </div>
  );
});
