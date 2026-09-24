/**
 * Shared types between server and client.
 * SCOUT — Oink Games (Kei Kajino). Digital implementation.
 */

/** A card holds two numbers. Only one of them is "active" depending on orientation. */
export interface Card {
  /** stable id, e.g. "3-7" */
  id: string;
  /** number printed on the top half */
  top: number;
  /** number printed on the bottom half */
  bottom: number;
  /** when true the card is rotated 180°, so `bottom` is the active number */
  flipped: boolean;
}

export type SetType = 'single' | 'run' | 'match';

export interface PlayedSet {
  cards: Card[];
  /** active values, left to right */
  values: number[];
  type: SetType;
  ownerId: string;
}

export type Phase = 'lobby' | 'flip' | 'playing' | 'roundEnd' | 'gameEnd';

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  connected: boolean;
  handCount: number;
  /** number of scout chips held */
  scoutChips: number;
  /** captured cards (1 pt each) */
  scoreCards: number;
  /** false once the Scout & Show chip has been spent this round */
  scoutShowAvailable: boolean;
  ready: boolean;
  /** set once the player has confirmed hand orientation this round */
  flipDecided: boolean;
  totalScore: number;
  /** filled in during roundEnd */
  roundScore?: number;
  roundBreakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  scoreCards: number;
  scoutChips: number;
  handPenalty: number;
  total: number;
  exempt: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'show' | 'scout' | 'scoutshow' | 'system' | 'round';
  playerId?: string;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  players: PublicPlayer[];
  /** index into players[] */
  currentPlayer: number;
  startingPlayer: number;
  round: number;
  totalRounds: number;
  activeSet: PlayedSet | null;
  twoPlayer: boolean;
  /** scout chips still in the middle (2p variant: chips spent by players) */
  centerChips: number;
  consecutiveNonShows: number;
  hostId: string;
  log: LogEntry[];
  /** id of the player that ended the round, if any */
  roundEnderId?: string;
  /** epoch ms at which the table advances on its own, so nobody waits on an AFK host */
  autoAdvanceAt?: number;
  roundEndCondition?: 'i' | 'ii';
  winnerIds?: string[];
  /** animation hint for the client */
  lastEvent?: GameEvent;
  /** bumped every time `lastEvent` changes, so the client can fire an effect exactly once */
  eventId: number;
}

export type GameEvent =
  | { kind: 'show'; playerId: string; cards: Card[]; captured: number }
  | { kind: 'scout'; playerId: string; ownerId: string; card: Card; from: 'left' | 'right'; toIndex: number }
  | { kind: 'scoutshow'; playerId: string }
  | { kind: 'roundStart'; round: number }
  | { kind: 'roundEnd'; enderId: string };

/** Private view handed only to its owner. */
export interface PrivateState {
  hand: Card[];
  /** indices in hand that form a legal, strong-enough set right now */
  legalShows: number[][];
  canScout: boolean;
  canScoutShow: boolean;
}

/* ---------- client → server ---------- */

export interface ShowAction {
  type: 'show';
  /** contiguous indices into the player's hand */
  indices: number[];
}

export interface ScoutAction {
  type: 'scout';
  /** which end of the active set to take */
  from: 'left' | 'right';
  /** where to insert into hand (0..handCount) */
  toIndex: number;
  /** insert the card rotated 180° */
  flip: boolean;
  /** immediately show afterwards (spends the Scout & Show chip) */
  andShow?: ShowAction;
}

export type PlayerAction = ShowAction | ScoutAction;

export interface RoomSettings {
  /** seconds; 0 = no timer */
  turnTimer: number;
}

/* ---------- chat ---------- */

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  avatar: number;
  text: string;
  /** epoch ms */
  at: number;
}
