/**
 * Your hand, held the way you would hold it: an overlapping fan that pivots
 * from a point below the screen. The order is fixed by the rules, so the only
 * interactions are picking a *contiguous* run of cards, or — while scouting —
 * choosing where the new card slides in.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@shared/types';
import { value } from '@shared/engine';
import { PlayingCard } from './PlayingCard';

export interface Selection {
  start: number;
  end: number;
}

export function selectionIndices(sel: Selection | null): number[] {
  if (!sel) return [];
  const out: number[] = [];
  for (let i = sel.start; i <= sel.end; i++) out.push(i);
  return out;
}

/** Clicking a card grows, shrinks or restarts the contiguous selection. */
export function toggleSelection(sel: Selection | null, index: number): Selection | null {
  if (!sel) return { start: index, end: index };
  if (index === sel.start && index === sel.end) return null;
  if (index === sel.start) return { start: sel.start + 1, end: sel.end };
  if (index === sel.end) return { start: sel.start, end: sel.end - 1 };
  if (index === sel.start - 1) return { start: index, end: sel.end };
  if (index === sel.end + 1) return { start: sel.start, end: index };
  return { start: index, end: index };
}

/**
 * Where a scouted card most wants to go: beside a card it can pair or run
 * with. Only an opening suggestion — the player can still move it anywhere.
 */
export function suggestInsertIndex(hand: Card[], card: Card): number {
  const v = value(card);
  let best = hand.length;
  let bestScore = -1;
  for (let at = 0; at <= hand.length; at++) {
    const left = at > 0 ? value(hand[at - 1]) : null;
    const right = at < hand.length ? value(hand[at]) : null;
    let score = 0;
    for (const n of [left, right]) {
      if (n === null) continue;
      if (n === v) score += 3;
      else if (Math.abs(n - v) === 1) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }
  return best;
}

/** Geometry of the fan, derived from how much room we actually have. */
function useFan(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width || 360;
  // Cards shrink as the hand grows, but never below a comfortable tap target.
  const cardW = Math.max(46, Math.min(96, (w - 28) / Math.max(4, count * 0.68)));
  const cardH = cardW * 1.5;
  // A long hand fans less per card, otherwise the end cards lie on their side.
  const perCard = Math.min(5, 44 / Math.max(count, 1));
  const arc = Math.min(24, count * 2.2);

  // Rotating about the bottom edge swings the top corner well past the card's
  // own width, so the outermost card needs that much room to stay on screen.
  const maxTilt = (((count - 1) / 2) * perCard * Math.PI) / 180;
  const reach = cardW / 2 + cardH * Math.sin(maxTilt);
  const span = Math.max(0, w - 2 * reach - 6);
  const spacing = count > 1 ? Math.min(cardW * 0.64, span / (count - 1)) : 0;

  return { ref, cardW, cardH, spacing, perCard, arc };
}

interface Props {
  hand: Card[];
  selection: Selection | null;
  onCardClick: (index: number) => void;
  /** indices that belong to at least one legal set right now */
  playableStarts: Set<number>;
  interactive: boolean;
  /** scouting: tapping a card chooses where the new one lands */
  placing?: boolean;
  /** index of the freshly inserted card inside `hand` */
  placedIndex?: number | null;
}

export function Hand({
  hand,
  selection,
  onCardClick,
  playableStarts,
  interactive,
  placing,
  placedIndex,
}: Props) {
  const selected = new Set(selectionIndices(selection));
  const { ref, cardW, cardH, spacing, perCard, arc } = useFan(hand.length);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (!interactive) setHovered(null);
  }, [interactive]);

  const mid = (hand.length - 1) / 2;
  const lift = Math.round(cardH * 0.2);
  // Cards dip below their baseline at the ends and rise when picked, so the
  // fan sits on a plinth tall enough for both without clipping the buttons.
  const baseline = arc + 4;

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height: cardH + baseline + lift * 1.5 + 8 }}
      role="group"
      aria-label="Bài trên tay"
    >
      {hand.map((card, i) => {
        const t = i - mid;
        const isSelected = selected.has(i);
        const isPlaced = placedIndex === i;
        const isHot = isSelected || isPlaced || hovered === i;

        // The fan pivots from below: ends swing out and dip down.
        const rotate = t * perCard * (isSelected ? 0.35 : 1);
        const dip = mid > 0 ? (t / mid) ** 2 * arc : 0;
        const raise = isSelected ? lift * 1.4 : hovered === i ? lift * 0.6 : 0;

        return (
          <motion.div
            key={card.id}
            className="absolute left-1/2 origin-bottom"
            style={{ width: cardW, bottom: baseline, zIndex: isHot ? 60 + i : i }}
            initial={{ opacity: 0, y: 150, rotate: 0, scale: 0.7 }}
            animate={{
              opacity: 1,
              x: t * spacing - cardW / 2,
              y: dip - raise,
              rotate,
              scale: isSelected ? 1.06 : 1,
            }}
            exit={{ opacity: 0, y: -100, scale: 0.6, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.7 }}
            onHoverStart={() => interactive && setHovered(i)}
            onHoverEnd={() => setHovered((h) => (h === i ? null : h))}
          >
            <PlayingCard
              card={card}
              selected={isSelected}
              hint={isPlaced}
              playable={!placing && interactive && selection === null && playableStarts.has(i)}
              onClick={interactive ? () => onCardClick(i) : undefined}
              className="w-full"
              shadow
            />
          </motion.div>
        );
      })}
    </div>
  );
}
