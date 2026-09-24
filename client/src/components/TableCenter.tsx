/**
 * The ring: a felt table seen from your chair. Cards land here from the
 * direction of whoever threw them, and a beaten set sweeps away face-down
 * into the winner's pile.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, GameState, PlayedSet } from '@shared/types';
import { PlayingCard } from './PlayingCard';

interface Props {
  state: GameState;
  youId: string;
  /** when scouting, the two ends light up and become clickable */
  pickingEnd: boolean;
  onPickEnd?: (end: 'left' | 'right') => void;
  chosenEnd?: 'left' | 'right' | null;
}

const SET_LABEL: Record<string, string> = {
  single: '1 lá',
  run: 'dãy liên tiếp',
  match: 'các số giống nhau',
};

/** Deterministic tilt so a set looks thrown down, not laid out by a machine. */
function tilt(id: string, i: number) {
  const seed = id.charCodeAt(0) * 7 + id.charCodeAt(id.length - 1) * 13 + i * 31;
  const r = Math.sin(seed) * 10000;
  return ((r - Math.floor(r)) - 0.5) * 7;
}

interface Flight {
  key: number;
  cards: Card[];
  /** true when the cards sweep toward you rather than away */
  toMe: boolean;
}

export function TableCenter({ state, youId, pickingEnd, onPickEnd, chosenEnd }: Props) {
  const set = state.activeSet;
  const owner = set ? state.players.find((p) => p.id === set.ownerId) : null;
  const lastIndex = set ? set.cards.length - 1 : -1;
  const ownedByMe = set?.ownerId === youId;

  /* A beaten set has already gone from the state by the time we render, so
     keep the previous one around long enough to animate it off the table. */
  const previous = useRef<PlayedSet | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);

  useEffect(() => {
    const ev = state.lastEvent;
    const captured = ev?.kind === 'show' && ev.captured > 0 && previous.current;
    if (!captured) {
      // Any other event means the previous sweep is over — clearing it here
      // matters because a quick follow-up move cancels the timer below.
      setFlight(null);
      return;
    }
    setFlight({ key: state.eventId, cards: previous.current!.cards, toMe: ev.playerId === youId });
    const timer = setTimeout(() => setFlight(null), 760);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventId]);

  useEffect(() => {
    previous.current = state.activeSet;
  }, [state.activeSet]);

  return (
    <div className="relative isolate flex min-h-[10rem] flex-1 items-center justify-center px-3 sm:min-h-[13rem]">
      {/* the felt, lit from above */}
      <div className="felt pointer-events-none absolute inset-x-2 inset-y-1 z-0 mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] sm:rounded-[50%/42%]" />

      {/* cards being swept away into a pile */}
      <AnimatePresence>
        {flight && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            {flight.cards.map((card, i) => (
              <motion.div
                key={`${flight.key}-${card.id}`}
                className="absolute w-[3.4rem] overflow-hidden rounded-[9%/6%] sm:w-[4.4rem]"
                initial={{ x: (i - (flight.cards.length - 1) / 2) * 62, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: (i - (flight.cards.length - 1) / 2) * 16,
                  y: flight.toMe ? 190 : -190,
                  rotate: flight.toMe ? 14 : -14,
                  opacity: 0,
                  scale: 0.55,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.6, 1], delay: i * 0.04 }}
              >
                <img src="/img/card-back.webp" alt="" className="aspect-[2/3] w-full object-cover" />
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {set ? (
          <motion.div
            key="set"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            className="absolute z-10 flex flex-col items-center gap-2"
          >
            <div className="rounded-full bg-black/25 px-3 py-0.5 text-[11px] font-semibold text-cream/75">
              {owner?.name ?? '?'} · {SET_LABEL[set.type] ?? ''}
            </div>

            <div className="flex items-center justify-center">
              {set.cards.map((card, i) => {
                const end: 'left' | 'right' | null = i === 0 ? 'left' : i === lastIndex ? 'right' : null;
                const scoutable = pickingEnd && end !== null;
                return (
                  <motion.div
                    key={card.id}
                    className="relative w-[4.2rem] sm:w-[5rem] md:w-[5.6rem]"
                    style={{ marginLeft: i === 0 ? 0 : '-0.5rem', zIndex: i }}
                    // Thrown from its owner's side of the table.
                    initial={{
                      y: ownedByMe ? 170 : -150,
                      x: ownedByMe ? 0 : (i - lastIndex / 2) * -30,
                      rotate: ownedByMe ? -18 : 18,
                      scale: 0.82,
                      opacity: 0,
                    }}
                    animate={{ y: 0, x: 0, rotate: tilt(card.id, i), scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 22,
                      mass: 0.8,
                      delay: i * 0.06,
                    }}
                  >
                    <PlayingCard
                      card={card}
                      muted
                      shadow
                      hint={scoutable && chosenEnd !== end}
                      selected={chosenEnd !== null && chosenEnd === end}
                      dimmed={pickingEnd && end === null}
                      onClick={scoutable && onPickEnd ? () => onPickEnd(end!) : undefined}
                      className="w-full"
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute z-10 rounded-2xl border border-dashed border-white/15 px-6 py-5 text-center"
          >
            <div className="display text-sm font-bold text-cream/60">Sàn diễn trống</div>
            <div className="mt-0.5 text-xs text-cream/40">Người tới lượt được đánh bộ bất kỳ</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
