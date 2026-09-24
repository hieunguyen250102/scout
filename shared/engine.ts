/**
 * Pure SCOUT rules engine. No I/O, no randomness except through `rng`.
 * Used by the server as the authority, and by the client to light up legal moves.
 */

import type { Card, PlayedSet, SetType, ScoreBreakdown } from './types';

/** Anything that can stand in for the active set when comparing strength. */
export type SetLike = { values: number[]; type: SetType };

/* ------------------------------------------------------------------ deck */

/** All 45 cards: every unordered pair of distinct numbers 1..10. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (let a = 1; a <= 10; a++) {
    for (let b = a + 1; b <= 10; b++) {
      deck.push({ id: `${a}-${b}`, top: a, bottom: b, flipped: false });
    }
  }
  return deck;
}

/**
 * Cards returned to the box, per the rulebook:
 *  - 3 players: every card showing a 10 (9 cards) → 36 = 12×3
 *  - 2 or 4 players: the 9/10 card (1 card)       → 44 = 11×4 and 11×2 + 22 set aside
 *  - 5 players: none                              → 45 = 9×5
 */
export function deckForPlayers(count: number): Card[] {
  const deck = fullDeck();
  if (count === 3) return deck.filter((c) => c.top !== 10 && c.bottom !== 10);
  if (count === 2 || count === 4) return deck.filter((c) => c.id !== '9-10');
  return deck;
}

export function handSizeFor(count: number): number {
  if (count === 2) return 11;
  if (count === 3) return 12;
  if (count === 4) return 11;
  return 9;
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Randomise both the order of the deck and the orientation of each card. */
export function shuffleDeck(deck: Card[], rng: Rng): Card[] {
  return shuffle(deck, rng).map((c) => ({ ...c, flipped: rng() < 0.5 }));
}

/* ----------------------------------------------------------------- cards */

/** The number currently facing the owner — the one that counts. */
export function value(card: Card): number {
  return card.flipped ? card.bottom : card.top;
}

/** The number currently upside down. */
export function otherValue(card: Card): number {
  return card.flipped ? card.top : card.bottom;
}

export function flipCard(card: Card): Card {
  return { ...card, flipped: !card.flipped };
}

/**
 * Rotating the whole fan 180° — allowed once, at the very start of a round.
 * Physically this reverses the left-to-right order *and* flips every card.
 */
export function rotateHand(hand: Card[]): Card[] {
  return hand.slice().reverse().map(flipCard);
}

/* ------------------------------------------------------------------ sets */

/** Classify a run of active values, or null when they do not form a legal set. */
export function classify(values: number[]): SetType | null {
  if (values.length === 0) return null;
  if (values.length === 1) return 'single';

  const allSame = values.every((v) => v === values[0]);
  if (allSame) return 'match';

  const ascending = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
  const descending = values.every((v, i) => i === 0 || v === values[i - 1] - 1);
  if (ascending || descending) return 'run';

  return null;
}

export function setStrengthValue(values: number[]): number {
  return Math.min(...values);
}

/**
 * Is `candidate` strong enough to replace `active`?
 *  1. more cards wins
 *  2. same size → matching beats consecutive
 *  3. same size and type → higher *lowest* number wins; ties lose
 */
export function beats(candidate: SetLike, active: SetLike | null): boolean {
  if (!active) return true;
  if (candidate.values.length !== active.values.length) {
    return candidate.values.length > active.values.length;
  }
  // Single cards carry no type — they are compared by number alone.
  if (candidate.values.length > 1 && candidate.type !== active.type) {
    return candidate.type === 'match';
  }
  return setStrengthValue(candidate.values) > setStrengthValue(active.values);
}

/* --------------------------------------------------------------- showing */

export interface ShowCheck {
  ok: boolean;
  reason?: string;
  type?: SetType;
  values?: number[];
}

/**
 * Validate a Show: the indices must be adjacent in hand (you may never
 * reorder your hand), must form a run or a match, and must beat the active set.
 */
export function checkShow(hand: Card[], indices: number[], active: SetLike | null): ShowCheck {
  if (indices.length === 0) return { ok: false, reason: 'Chưa chọn lá nào' };

  const sorted = indices.slice().sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) return { ok: false, reason: 'Lá bị chọn trùng' };
  if (sorted[0] < 0 || sorted[sorted.length - 1] >= hand.length) {
    return { ok: false, reason: 'Lá không hợp lệ' };
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return { ok: false, reason: 'Các lá phải nằm liền nhau trên tay' };
    }
  }

  const values = sorted.map((i) => value(hand[i]));
  const type = classify(values);
  if (!type) return { ok: false, reason: 'Phải là dãy liên tiếp hoặc các số giống nhau' };

  if (!beats({ values, type }, active)) {
    return { ok: false, reason: 'Bộ này không mạnh hơn bộ đang mở', type, values };
  }
  return { ok: true, type, values };
}

/** Every contiguous slice of the hand that could legally be shown right now. */
export function legalShows(hand: Card[], active: SetLike | null): number[][] {
  const out: number[][] = [];
  for (let start = 0; start < hand.length; start++) {
    for (let end = start; end < hand.length; end++) {
      const indices: number[] = [];
      for (let i = start; i <= end; i++) indices.push(i);
      const values = indices.map((i) => value(hand[i]));
      const type = classify(values);
      if (!type) {
        // Once a slice stops being a legal shape, extending it further cannot help.
        break;
      }
      if (beats({ values, type }, active)) out.push(indices);
    }
  }
  return out;
}

export function makeSet(cards: Card[], ownerId: string): PlayedSet {
  const values = cards.map(value);
  return { cards, values, type: classify(values) ?? 'single', ownerId };
}

/* --------------------------------------------------------------- scoring */

export function scoreRound(params: {
  scoreCards: number;
  scoutChips: number;
  handCount: number;
  /** the player who ended the round via condition "ii" keeps their hand for free */
  exempt: boolean;
}): ScoreBreakdown {
  const handPenalty = params.exempt ? 0 : params.handCount;
  return {
    scoreCards: params.scoreCards,
    scoutChips: params.scoutChips,
    handPenalty,
    total: params.scoreCards + params.scoutChips - handPenalty,
    exempt: params.exempt,
  };
}
