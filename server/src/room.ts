/**
 * Authoritative room + game state machine.
 * Every rule decision happens here; clients only ever send intents.
 */

import {
  checkShow,
  classify,
  deckForPlayers,
  handSizeFor,
  legalShows,
  makeSet,
  rotateHand,
  scoreRound,
  shuffleDeck,
  value,
} from '../../shared/engine';
import type {
  Card,
  ChatMessage,
  GameEvent,
  GameState,
  LogEntry,
  PlayedSet,
  PrivateState,
  PublicPlayer,
  ScoutAction,
  ShowAction,
} from '../../shared/types';

/** How long the score summary stays up before the table moves on by itself. */
export const ROUND_END_PAUSE_MS = 15000;

export interface Player {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  connected: boolean;
  socketId?: string;
  hand: Card[];
  scoutChips: number;
  scoreCards: number;
  scoutShowAvailable: boolean;
  flipDecided: boolean;
  totalScore: number;
  roundScore?: number;
  roundBreakdown?: PublicPlayer['roundBreakdown'];
  /** epoch ms of the disconnect, used to hand the seat to the autopilot */
  disconnectedAt?: number;
}

export class Room {
  code: string;
  players: Player[] = [];
  hostId = '';
  phase: GameState['phase'] = 'lobby';
  round = 0;
  totalRounds = 0;
  currentPlayer = 0;
  startingPlayer = 0;
  activeSet: PlayedSet | null = null;
  consecutiveNonShows = 0;
  centerChips = 0;
  log: LogEntry[] = [];
  lastEvent?: GameEvent;
  eventId = 0;
  roundEnderId?: string;
  roundEndCondition?: 'i' | 'ii';
  winnerIds?: string[];
  createdAt = Date.now();
  lastActivity = Date.now();
  /** when the round-end summary auto-advances (an AFK host must not stall the table) */
  autoAdvanceAt?: number;

  /** table talk, kept short so a rejoining player gets some context */
  chat: ChatMessage[] = [];

  /** 2-player variant keeps the second half of the deck for round 2 */
  private reserveDeck: Card[] = [];
  private logSeq = 0;
  private chatSeq = 0;

  constructor(code: string) {
    this.code = code;
  }

  get twoPlayer(): boolean {
    return this.players.length === 2;
  }

  get playerCount(): number {
    return this.players.length;
  }

  /* --------------------------------------------------------- membership */

  addPlayer(p: { id: string; name: string; avatar: number; isBot?: boolean; socketId?: string }): Player | null {
    if (this.phase !== 'lobby') return null;
    if (this.players.length >= 5) return null;
    const player: Player = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: !!p.isBot,
      connected: true,
      socketId: p.socketId,
      hand: [],
      scoutChips: 0,
      scoreCards: 0,
      scoutShowAvailable: true,
      flipDecided: false,
      totalScore: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.pushLog('system', `${player.name} vào phòng`);
    this.touch();
    return player;
  }

  removePlayer(id: string): void {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [gone] = this.players.splice(idx, 1);
    this.pushLog('system', `${gone.name} rời phòng`);
    if (this.hostId === id) {
      const next = this.players.find((p) => !p.isBot);
      this.hostId = next ? next.id : '';
    }
    if (this.currentPlayer >= this.players.length) this.currentPlayer = 0;
    if (this.startingPlayer >= this.players.length) this.startingPlayer = 0;
    this.touch();
  }

  find(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  setConnected(id: string, connected: boolean, socketId?: string): void {
    const p = this.find(id);
    if (!p) return;
    p.connected = connected;
    p.socketId = connected ? socketId : undefined;
    p.disconnectedAt = connected ? undefined : Date.now();
    this.touch();
  }

  /* --------------------------------------------------------------- game */

  start(): string | null {
    if (this.phase !== 'lobby') return 'Ván đã bắt đầu';
    if (this.players.length < 2) return 'Cần ít nhất 2 người chơi';
    this.totalRounds = this.players.length;
    this.round = 0;
    this.startingPlayer = 0;
    for (const p of this.players) {
      p.totalScore = 0;
      p.roundScore = undefined;
      p.roundBreakdown = undefined;
    }
    this.pushLog('system', `Bắt đầu ván — ${this.totalRounds} vòng`);
    this.beginRound();
    return null;
  }

  private beginRound(): void {
    this.round += 1;
    this.phase = 'flip';
    this.activeSet = null;
    this.consecutiveNonShows = 0;
    this.roundEnderId = undefined;
    this.roundEndCondition = undefined;

    const n = this.players.length;
    const handSize = handSizeFor(n);

    if (this.twoPlayer) {
      // Shuffle once for the whole game: round 1 uses the top half, round 2 the rest.
      if (this.round === 1) {
        const deck = shuffleDeck(deckForPlayers(2), Math.random);
        this.players[0].hand = deck.slice(0, handSize);
        this.players[1].hand = deck.slice(handSize, handSize * 2);
        this.reserveDeck = deck.slice(handSize * 2);
      } else {
        this.players[0].hand = this.reserveDeck.slice(0, handSize);
        this.players[1].hand = this.reserveDeck.slice(handSize, handSize * 2);
      }
      // 2p: each player holds 3 scout chips and spends them to scout.
      for (const p of this.players) {
        p.scoutChips = 3;
        p.scoutShowAvailable = false;
      }
      this.centerChips = 0;
    } else {
      const deck = shuffleDeck(deckForPlayers(n), Math.random);
      this.players.forEach((p, i) => {
        p.hand = deck.slice(i * handSize, (i + 1) * handSize);
        p.scoutChips = 0;
        p.scoutShowAvailable = true;
      });
      this.centerChips = 0;
    }

    for (const p of this.players) {
      p.scoreCards = 0;
      p.flipDecided = false;
      p.roundScore = undefined;
      p.roundBreakdown = undefined;
    }

    this.currentPlayer = this.startingPlayer;
    this.setEvent({ kind: 'roundStart', round: this.round });
    this.pushLog('round', `— Vòng ${this.round}/${this.totalRounds} —`);
    this.touch();

    // Bots never agonise over orientation; decide for them straight away.
    for (const p of this.players) {
      if (p.isBot) this.decideFlip(p.id, this.botWantsRotate(p));
    }
  }

  /** Round setup step: keep the hand as dealt, or rotate the whole fan 180°. */
  decideFlip(playerId: string, rotate: boolean): string | null {
    if (this.phase !== 'flip') return 'Không phải lúc xoay bài';
    const p = this.find(playerId);
    if (!p) return 'Không tìm thấy người chơi';
    if (p.flipDecided) return 'Bạn đã chọn rồi';
    if (rotate) p.hand = rotateHand(p.hand);
    p.flipDecided = true;
    this.touch();
    if (this.players.every((x) => x.flipDecided)) {
      this.phase = 'playing';
      this.pushLog('system', 'Tất cả đã sẵn sàng — bắt đầu!');
    }
    return null;
  }

  /** A hand with more adjacent runs/pairs the "right" way up is worth keeping. */
  private botWantsRotate(p: Player): boolean {
    const score = (hand: Card[]): number => {
      let s = 0;
      for (let i = 0; i + 1 < hand.length; i++) {
        const a = value(hand[i]);
        const b = value(hand[i + 1]);
        if (a === b) s += 2;
        else if (Math.abs(a - b) === 1) s += 2;
      }
      // low cards are dead weight — slight preference for higher values
      s += hand.reduce((acc, c) => acc + value(c), 0) / (hand.length * 10);
      return s;
    };
    return score(rotateHand(p.hand)) > score(p.hand);
  }

  /* -------------------------------------------------------------- turns */

  get current(): Player {
    return this.players[this.currentPlayer];
  }

  private advanceTurn(): void {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
  }

  show(playerId: string, action: ShowAction): string | null {
    if (this.phase !== 'playing') return 'Chưa tới lúc đánh bài';
    if (this.current.id !== playerId) return 'Chưa tới lượt bạn';
    const p = this.current;

    const check = checkShow(p.hand, action.indices, this.activeSet);
    if (!check.ok) return check.reason ?? 'Nước đi không hợp lệ';

    this.applyShow(p, action.indices);
    return null;
  }

  private applyShow(p: Player, indices: number[]): void {
    const sorted = indices.slice().sort((a, b) => a - b);
    const cards = sorted.map((i) => p.hand[i]);

    // Beaten set is turned face down in front of the winner: 1 point per card.
    const captured = this.activeSet?.cards.length ?? 0;
    if (this.activeSet) p.scoreCards += captured;

    p.hand = p.hand.filter((_, i) => !sorted.includes(i));
    this.activeSet = makeSet(cards, p.id);
    this.consecutiveNonShows = 0;
    this.setEvent({ kind: 'show', playerId: p.id, cards, captured });

    const label = cards.map(value).join('-');
    this.pushLog('show', `${p.name} đánh [${label}]${captured ? ` và ăn ${captured} lá` : ''}`, p.id);

    if (p.hand.length === 0) {
      this.endRound(p.id, 'i');
      return;
    }
    this.advanceTurn();
    this.checkStuck();
    this.touch();
  }

  scout(playerId: string, action: ScoutAction): string | null {
    if (this.phase !== 'playing') return 'Chưa tới lúc đánh bài';
    if (this.current.id !== playerId) return 'Chưa tới lượt bạn';
    const p = this.current;

    if (!this.activeSet || this.activeSet.cards.length === 0) return 'Không có bộ nào để Scout';
    if (this.twoPlayer && p.scoutChips <= 0) return 'Bạn đã hết chip Scout';
    if (action.andShow && !p.scoutShowAvailable) return 'Đã dùng chip Scout & Show vòng này';
    if (action.toIndex < 0 || action.toIndex > p.hand.length) return 'Vị trí chèn không hợp lệ';

    const owner = this.find(this.activeSet.ownerId);
    const taken =
      action.from === 'left' ? this.activeSet.cards[0] : this.activeSet.cards[this.activeSet.cards.length - 1];
    const card: Card = action.flip ? { ...taken, flipped: !taken.flipped } : { ...taken };

    // Remove from the active set, then rebuild it (it keeps its owner).
    const remaining =
      action.from === 'left' ? this.activeSet.cards.slice(1) : this.activeSet.cards.slice(0, -1);

    p.hand = [...p.hand.slice(0, action.toIndex), card, ...p.hand.slice(action.toIndex)];

    if (this.twoPlayer) {
      // The scouting player pays a chip into the middle.
      p.scoutChips -= 1;
      this.centerChips += 1;
    } else if (owner && owner.id !== p.id) {
      // The owner of the set is compensated with a scout chip (1 point).
      owner.scoutChips += 1;
    }

    if (remaining.length === 0) {
      this.activeSet = null;
    } else {
      this.activeSet = {
        cards: remaining,
        values: remaining.map(value),
        type: classify(remaining.map(value)) ?? 'single',
        ownerId: this.activeSet.ownerId,
      };
    }

    this.setEvent({
      kind: 'scout',
      playerId: p.id,
      ownerId: owner?.id ?? '',
      card,
      from: action.from,
      toIndex: action.toIndex,
    });
    this.pushLog('scout', `${p.name} Scout lá ${value(card)}`, p.id);

    if (action.andShow) {
      const check = checkShow(p.hand, action.andShow.indices, this.activeSet);
      if (!check.ok) {
        // The scout already happened; refuse only the show half and pass the turn.
        this.finishScoutTurn(p);
        return check.reason ?? 'Bộ Show sau khi Scout không hợp lệ';
      }
      p.scoutShowAvailable = false;
      this.pushLog('scoutshow', `${p.name} dùng chip Scout & Show`, p.id);
      this.setEvent({ kind: 'scoutshow', playerId: p.id });
      this.applyShow(p, action.andShow.indices);
      return null;
    }

    this.finishScoutTurn(p);
    return null;
  }

  private finishScoutTurn(p: Player): void {
    // With no set left on the table the next player may show anything,
    // so there is no longer an unbeaten set that could end the round.
    this.consecutiveNonShows = this.activeSet ? this.consecutiveNonShows + 1 : 0;

    if (this.twoPlayer) {
      // 2p: scouting does not pass the turn — you keep going until you Show.
      this.checkStuck();
      this.touch();
      return;
    }

    // Everyone else in turn failed to beat the set: its owner ends the round.
    if (this.consecutiveNonShows >= this.players.length - 1 && this.activeSet) {
      this.endRound(this.activeSet.ownerId, 'ii');
      return;
    }
    this.advanceTurn();
    this.checkStuck();
    this.touch();
  }

  /**
   * 2-player variant: if the player to move can neither Show nor Scout,
   * the round ends and the owner of the active set is exempt from the
   * hand penalty (condition "ii").
   */
  private checkStuck(): void {
    if (this.phase !== 'playing') return;
    if (!this.twoPlayer) return;
    const p = this.current;
    const canShow = legalShows(p.hand, this.activeSet).length > 0;
    const canScout = !!this.activeSet && this.activeSet.cards.length > 0 && p.scoutChips > 0;
    if (!canShow && !canScout && this.activeSet) {
      this.endRound(this.activeSet.ownerId, 'ii');
    }
  }

  /* ------------------------------------------------------------ scoring */

  private endRound(enderId: string, condition: 'i' | 'ii'): void {
    this.phase = 'roundEnd';
    this.autoAdvanceAt = Date.now() + ROUND_END_PAUSE_MS;
    this.roundEnderId = enderId;
    this.roundEndCondition = condition;
    this.setEvent({ kind: 'roundEnd', enderId });

    for (const p of this.players) {
      // Only the player who ended the round by condition "ii" keeps their hand for free.
      const exempt = p.id === enderId && condition === 'ii';
      const breakdown = scoreRound({
        scoreCards: p.scoreCards,
        scoutChips: p.scoutChips,
        handCount: p.hand.length,
        exempt,
      });
      p.roundBreakdown = breakdown;
      p.roundScore = breakdown.total;
      p.totalScore += breakdown.total;
    }

    const ender = this.find(enderId);
    this.pushLog(
      'round',
      `Vòng ${this.round} kết thúc — ${ender?.name ?? '?'} ${condition === 'i' ? 'đã hết bài' : 'không ai chặn được'}`,
    );
    this.touch();
  }

  /** Host (or the auto-advance timer) moves the table to the next round. */
  nextRound(): string | null {
    if (this.phase !== 'roundEnd') return 'Chưa hết vòng';
    this.autoAdvanceAt = undefined;
    if (this.round >= this.totalRounds) {
      this.phase = 'gameEnd';
      const best = Math.max(...this.players.map((p) => p.totalScore));
      this.winnerIds = this.players.filter((p) => p.totalScore === best).map((p) => p.id);
      const names = this.players
        .filter((p) => this.winnerIds!.includes(p.id))
        .map((p) => p.name)
        .join(', ');
      this.pushLog('round', `Kết thúc! Người thắng: ${names}`);
      this.touch();
      return null;
    }
    this.startingPlayer = (this.startingPlayer + 1) % this.players.length;
    this.beginRound();
    return null;
  }

  /** Back to the lobby with the same people, scores cleared. */
  resetToLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.activeSet = null;
    this.winnerIds = undefined;
    this.roundEnderId = undefined;
    this.lastEvent = undefined;
    for (const p of this.players) {
      p.hand = [];
      p.scoreCards = 0;
      p.scoutChips = 0;
      p.totalScore = 0;
      p.roundScore = undefined;
      p.roundBreakdown = undefined;
      p.flipDecided = false;
      p.scoutShowAvailable = true;
    }
    this.log = [];
    this.touch();
  }

  /* ----------------------------------------------------------- snapshots */

  publicState(): GameState {
    return {
      roomCode: this.code,
      phase: this.phase,
      players: this.players.map<PublicPlayer>((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        connected: p.connected,
        handCount: p.hand.length,
        scoutChips: p.scoutChips,
        scoreCards: p.scoreCards,
        scoutShowAvailable: p.scoutShowAvailable,
        ready: p.flipDecided,
        flipDecided: p.flipDecided,
        totalScore: p.totalScore,
        roundScore: p.roundScore,
        roundBreakdown: p.roundBreakdown,
      })),
      currentPlayer: this.currentPlayer,
      startingPlayer: this.startingPlayer,
      round: this.round,
      totalRounds: this.totalRounds,
      activeSet: this.activeSet,
      twoPlayer: this.twoPlayer,
      centerChips: this.centerChips,
      consecutiveNonShows: this.consecutiveNonShows,
      hostId: this.hostId,
      log: this.log.slice(-40),
      roundEnderId: this.roundEnderId,
      autoAdvanceAt: this.autoAdvanceAt,
      roundEndCondition: this.roundEndCondition,
      winnerIds: this.winnerIds,
      lastEvent: this.lastEvent,
      eventId: this.eventId,
    };
  }

  privateState(playerId: string): PrivateState | null {
    const p = this.find(playerId);
    if (!p) return null;
    const isTurn = this.phase === 'playing' && this.current.id === playerId;
    return {
      hand: p.hand,
      legalShows: isTurn ? legalShows(p.hand, this.activeSet) : [],
      canScout:
        isTurn && !!this.activeSet && this.activeSet.cards.length > 0 && (!this.twoPlayer || p.scoutChips > 0),
      canScoutShow: isTurn && !this.twoPlayer && p.scoutShowAvailable && !!this.activeSet,
    };
  }

  /* -------------------------------------------------------------- utils */

  /** Records an animation hint; the id lets the client fire the effect once. */
  private setEvent(event: GameEvent): void {
    this.lastEvent = event;
    this.eventId += 1;
  }

  pushLog(kind: LogEntry['kind'], text: string, playerId?: string): void {
    this.log.push({ id: ++this.logSeq, kind, text, playerId });
    if (this.log.length > 200) this.log = this.log.slice(-200);
  }

  addChat(playerId: string, text: string): ChatMessage | null {
    const p = this.find(playerId);
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!p || !clean) return null;
    const msg: ChatMessage = { id: ++this.chatSeq, playerId, name: p.name, avatar: p.avatar, text: clean, at: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 80) this.chat = this.chat.slice(-80);
    this.touch();
    return msg;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }
}
