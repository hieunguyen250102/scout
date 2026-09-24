/**
 * Heuristic opponents. Good enough to be a real sparring partner,
 * simple enough to stay readable.
 */

import { classify, legalShows, value } from '../../shared/engine';
import type { SetLike } from '../../shared/engine';
import type { Card, PlayerAction } from '../../shared/types';
import type { Room } from './room';

/** How much future potential a hand still holds: adjacent pairs and runs are gold. */
function handPotential(hand: Card[]): number {
  let score = 0;
  for (let i = 0; i + 1 < hand.length; i++) {
    const a = value(hand[i]);
    const b = value(hand[i + 1]);
    if (a === b) score += 3;
    else if (Math.abs(a - b) === 1) score += 2;
  }
  // long contiguous blocks are worth more than the sum of their pairs
  let runLen = 1;
  for (let i = 1; i < hand.length; i++) {
    const prev = value(hand[i - 1]);
    const cur = value(hand[i]);
    if (cur === prev || Math.abs(cur - prev) === 1) runLen++;
    else {
      score += runLen > 2 ? runLen : 0;
      runLen = 1;
    }
  }
  score += runLen > 2 ? runLen : 0;
  return score;
}

function removeIndices(hand: Card[], indices: number[]): Card[] {
  const set = new Set(indices);
  return hand.filter((_, i) => !set.has(i));
}

export function chooseAction(room: Room, playerId: string): PlayerAction | null {
  const player = room.find(playerId);
  if (!player) return null;
  const hand = player.hand;
  const active = room.activeSet;

  const shows = legalShows(hand, active);
  const canScout =
    !!active && active.cards.length > 0 && (!room.twoPlayer || player.scoutChips > 0);

  /* ---- rate every legal show ---- */
  let best: { action: PlayerAction; score: number } | null = null;
  for (const indices of shows) {
    const captured = active?.cards.length ?? 0;
    const remaining = removeIndices(hand, indices);
    const values = indices.map((i) => value(hand[i]));
    const type = classify(values) ?? 'single';

    let score = 0;
    score += captured * 1.4; // points taken off the table
    score += indices.length * 1.3; // cards out of hand = fewer minus points
    score += handPotential(remaining) * 0.55; // do not wreck the hand
    score -= remaining.length * 0.35;
    // Dumping a monster set early wins the round; keep a little in reserve though.
    if (remaining.length === 0) score += 12;
    // Matching sets are precious — spend them only when they buy something.
    if (type === 'match' && captured === 0 && indices.length < 3) score -= 1.5;

    if (!best || score > best.score) best = { action: { type: 'show', indices }, score };
  }

  /* ---- rate scouting ---- */
  let bestScout: { action: PlayerAction; score: number } | null = null;
  if (canScout && active) {
    const ends: Array<'left' | 'right'> = active.cards.length === 1 ? ['left'] : ['left', 'right'];
    for (const from of ends) {
      const raw = from === 'left' ? active.cards[0] : active.cards[active.cards.length - 1];
      for (const flip of [false, true]) {
        const card: Card = flip ? { ...raw, flipped: !raw.flipped } : { ...raw };
        for (let at = 0; at <= hand.length; at++) {
          const next = [...hand.slice(0, at), card, ...hand.slice(at)];
          let score = handPotential(next) - handPotential(hand);
          score -= 1.1; // the card itself is a minus point, and the owner gains one
          if (room.twoPlayer) score -= 0.8; // chips are scarce
          if (bestScout === null || score > bestScout.score) {
            bestScout = { action: { type: 'scout', from, toIndex: at, flip }, score };
          }
        }
      }
    }
  }

  /* ---- Scout & Show: scout, then immediately unload ---- */
  if (!room.twoPlayer && player.scoutShowAvailable && active && active.cards.length > 0) {
    const ends: Array<'left' | 'right'> = active.cards.length === 1 ? ['left'] : ['left', 'right'];
    for (const from of ends) {
      const raw = from === 'left' ? active.cards[0] : active.cards[active.cards.length - 1];
      const rest = from === 'left' ? active.cards.slice(1) : active.cards.slice(0, -1);
      const restSet = rest.length
        ? { values: rest.map(value), type: classify(rest.map(value)) ?? ('single' as const) }
        : null;
      for (const flip of [false, true]) {
        const card: Card = flip ? { ...raw, flipped: !raw.flipped } : { ...raw };
        for (let at = 0; at <= hand.length; at++) {
          const next = [...hand.slice(0, at), card, ...hand.slice(at)];
          for (const indices of legalShowsAgainst(next, restSet)) {
            if (!indices.includes(at)) continue; // only worth it if the scouted card is used
            const remaining = removeIndices(next, indices);
            let score = rest.length * 1.4 + indices.length * 1.3 + handPotential(remaining) * 0.55;
            score -= remaining.length * 0.35;
            if (remaining.length === 0) score += 12;
            score -= 2.5; // the chip is a one-shot resource
            if (!best || score > best.score) {
              best = {
                action: {
                  type: 'scout',
                  from,
                  toIndex: at,
                  flip,
                  andShow: { type: 'show', indices },
                },
                score,
              };
            }
          }
        }
      }
    }
  }

  if (best && bestScout) return best.score >= bestScout.score ? best.action : bestScout.action;
  if (best) return best.action;
  if (bestScout) return bestScout.action;
  return null;
}

function legalShowsAgainst(hand: Card[], active: SetLike | null): number[][] {
  return legalShows(hand, active);
}
