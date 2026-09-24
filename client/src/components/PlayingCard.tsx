/**
 * A card on screen: face or back, with a 3-D flip when its orientation
 * changes and a spring-loaded lift when selected.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@shared/types';
import { otherValue, value } from '@shared/engine';
import { CardFace } from './CardFace';

interface Props {
  card: Card;
  selected?: boolean;
  dimmed?: boolean;
  /** highlight ring, e.g. the scoutable ends of the active set */
  hint?: boolean;
  /** this card can start or join a legal set right now */
  playable?: boolean;
  muted?: boolean;
  /** drop shadow, for cards held in hand or lying on the felt */
  shadow?: boolean;
  onClick?: () => void;
  className?: string;
  /** shared-element id so the card flies between places */
  layoutId?: string;
}

function PlayingCardImpl({
  card,
  selected,
  dimmed,
  hint,
  playable,
  muted,
  shadow,
  onClick,
  className = '',
  layoutId,
}: Props) {
  const front = value(card);
  const back = otherValue(card);

  return (
    // Deliberately a div, not a button: cards are nested inside larger
    // clickable surfaces (the flip prompt, the seat summaries).
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-pressed={onClick ? selected : undefined}
      className={`card3d relative aspect-[2/3] select-none rounded-[9%/6%] outline-none ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      } ${className}`}
      animate={{
        opacity: dimmed ? 0.55 : 1,
        filter: dimmed ? 'saturate(0.4) brightness(0.8)' : 'none',
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={
        shadow
          ? { filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }
          : undefined
      }
    >
      {/* a small brass tab on top marks a card that can join a legal set right now */}
      {playable && !selected && (
        <motion.span
          className="pointer-events-none absolute -top-[5%] left-[14%] h-[3.5%] min-h-[4px] w-[30%] rounded-full bg-gold"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        />
      )}

      <motion.div
        className="card3d-inner h-full w-full"
        animate={{ rotateY: card.flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Both orientations are rendered; the flip simply turns to the other one. */}
        <div className="card-face absolute inset-0" style={{ transform: 'rotateY(0deg)' }} aria-hidden>
          <CardFace active={card.top} passive={card.bottom} muted={muted} />
        </div>
        <div className="card-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }} aria-hidden>
          <CardFace active={card.bottom} passive={card.top} muted={muted} />
        </div>
      </motion.div>

      {/* selection: a crisp brass outline, no glow */}
      {selected && (
        <motion.span
          className="pointer-events-none absolute -inset-[3%] rounded-[11%/7.5%] border-[3px] border-gold"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
        />
      )}
      {hint && !selected && (
        <motion.span
          className="pointer-events-none absolute -inset-[3%] rounded-[11%/7.5%] border-2 border-dashed border-gold"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className="sr-only">{`Lá số ${front}, mặt kia ${back}`}</span>
    </motion.div>
  );
}

export const PlayingCard = memo(PlayingCardImpl);
