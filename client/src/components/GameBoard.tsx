/**
 * The table from your chair: opponents across the felt, the ring in the
 * middle, your fan along the bottom — plus the little state machine that
 * walks you through a Scout.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, GameState, PrivateState, ScoutAction } from '@shared/types';
import { checkShow, classify, value } from '@shared/engine';
import { Hand, selectionIndices, suggestInsertIndex, toggleSelection, type Selection } from './Hand';
import { PlayerSeat } from './PlayerSeat';
import { TableCenter } from './TableCenter';
import { CardPile } from './CardPile';
import { ChipStack, ScoutShowToken, StartMarker } from './Chips';
import { Avatar } from './PlayerSeat';
import { Logo } from './Logo';
import { sfx } from '../lib/sound';
import { GOLD } from '../lib/theme';
import { ChatBox, type ChatItem } from './Chat';

/** how long a chat line hangs over its author's seat */
const BUBBLE_MS = 6000;

/** idle → pick-end → place → (select, only for Scout & Show) */
type Mode = 'idle' | 'pick-end' | 'place' | 'select';

interface Props {
  state: GameState;
  priv: PrivateState;
  youId: string;
  onShow: (indices: number[]) => void;
  onScout: (action: ScoutAction) => void;
  onShowRules: () => void;
  onLeave: () => void;
  muted: boolean;
  onToggleMute: () => void;
  chat: ChatItem[];
  onSendChat: (text: string) => void;
}

export function GameBoard({
  state,
  priv,
  youId,
  onShow,
  onScout,
  onShowRules,
  onLeave,
  muted,
  onToggleMute,
  chat,
  onSendChat,
}: Props) {
  const me = state.players.find((p) => p.id === youId);
  const isMyTurn = state.phase === 'playing' && state.players[state.currentPlayer]?.id === youId;

  const [selection, setSelection] = useState<Selection | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [scoutAndShow, setScoutAndShow] = useState(false);
  const [end, setEnd] = useState<'left' | 'right' | null>(null);
  const [flip, setFlip] = useState(false);
  const [insertAt, setInsertAt] = useState(0);
  const [panel, setPanel] = useState<'chat' | 'log' | null>(null);

  /* ------------------------------------------------------------- chat */

  const lastChatId = chat.length ? chat[chat.length - 1].id : 0;
  const [seenChatId, setSeenChatId] = useState(lastChatId);
  useEffect(() => {
    if (panel === 'chat') setSeenChatId(lastChatId);
  }, [panel, lastChatId]);
  const unread = chat.filter((m) => m.id > seenChatId && m.playerId !== youId).length;

  // Re-render when the newest bubble should disappear.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), BUBBLE_MS + 50);
    return () => clearTimeout(t);
  }, [lastChatId]);
  const bubbles = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of chat) if (m.recvAt && now - m.recvAt < BUBBLE_MS) out.set(m.playerId, m.text);
    return out;
  }, [chat, now]);

  const reset = () => {
    setSelection(null);
    setMode('idle');
    setScoutAndShow(false);
    setEnd(null);
    setFlip(false);
    setInsertAt(0);
  };

  /* A new turn or a new round drops whatever we were half-way through. */
  useEffect(reset, [state.currentPlayer, state.round, state.phase]);

  useEffect(() => {
    if (isMyTurn) sfx.turn();
  }, [isMyTurn]);

  const active = state.activeSet;
  const placing = mode === 'place' || mode === 'select';

  /** The card we are about to take, with the flip already applied. */
  const scoutCard: Card | null = useMemo(() => {
    if (!active || !end) return null;
    const raw = end === 'left' ? active.cards[0] : active.cards[active.cards.length - 1];
    return flip ? { ...raw, flipped: !raw.flipped } : raw;
  }, [active, end, flip]);

  /** What is left on the table afterwards — what a Scout & Show must beat. */
  const remainingSet = useMemo(() => {
    if (!active || !end) return active;
    const rest = end === 'left' ? active.cards.slice(1) : active.cards.slice(0, -1);
    if (rest.length === 0) return null;
    const values = rest.map(value);
    return { cards: rest, values, type: classify(values) ?? ('single' as const), ownerId: active.ownerId };
  }, [active, end]);

  /** While scouting we work with the hand we are *about to* have. */
  const workingHand: Card[] = useMemo(() => {
    if (placing && scoutCard) {
      return [...priv.hand.slice(0, insertAt), scoutCard, ...priv.hand.slice(insertAt)];
    }
    return priv.hand;
  }, [priv.hand, placing, scoutCard, insertAt]);

  const compareAgainst = placing ? remainingSet : active;

  const showCheck = useMemo(() => {
    const indices = selectionIndices(selection);
    if (indices.length === 0) return null;
    return checkShow(workingHand, indices, compareAgainst);
  }, [selection, workingHand, compareAgainst]);

  const playableStarts = useMemo(() => {
    const set = new Set<number>();
    // On an empty table every card is playable, so highlighting them all
    // would be noise rather than a hint.
    if (isMyTurn && mode === 'idle' && active) {
      for (const indices of priv.legalShows) for (const i of indices) set.add(i);
    }
    // Same story when the table is weak enough that almost anything beats it:
    // a hand glowing end to end tells the player nothing.
    if (set.size > priv.hand.length * 0.7) return new Set<number>();
    return set;
  }, [priv.legalShows, priv.hand.length, isMyTurn, mode, active]);

  /* ------------------------------------------------------------ actions */

  const beginScout = (withShow: boolean) => {
    if (!active) return;
    sfx.tap();
    setSelection(null);
    setScoutAndShow(withShow);
    setFlip(false);
    if (active.cards.length === 1) {
      pickEnd('left', withShow);
    } else {
      setEnd(null);
      setMode('pick-end');
    }
  };

  const pickEnd = (which: 'left' | 'right', withShow = scoutAndShow) => {
    if (!active) return;
    const raw = which === 'left' ? active.cards[0] : active.cards[active.cards.length - 1];
    setEnd(which);
    setInsertAt(suggestInsertIndex(priv.hand, raw));
    setMode('place');
    void withShow;
  };

  const cancel = () => {
    sfx.tap();
    reset();
  };

  const submitScout = () => {
    if (!end) return;
    sfx.scout();
    onScout({ type: 'scout', from: end, toIndex: insertAt, flip });
    reset();
  };

  const submitShow = () => {
    const indices = selectionIndices(selection);
    if (indices.length === 0) return;
    sfx.show();
    if (mode === 'select' && end) {
      onScout({ type: 'scout', from: end, toIndex: insertAt, flip, andShow: { type: 'show', indices } });
    } else {
      onShow(indices);
    }
    reset();
  };

  const nudge = (delta: number) => {
    sfx.tap();
    setInsertAt((i) => Math.max(0, Math.min(priv.hand.length, i + delta)));
  };

  /* ------------------------------------------------------------- render */

  const others = state.players.filter((p) => p.id !== youId);
  const turnName = state.players[state.currentPlayer]?.name ?? '';
  const iAmStarter = state.players[state.startingPlayer]?.id === youId;

  // In the 2-player variant a Scout does not pass the turn, which looks like a
  // bug unless we say so: the player scouts and is suddenly "up" again.
  const justScouted =
    state.twoPlayer &&
    isMyTurn &&
    state.lastEvent?.kind === 'scout' &&
    state.lastEvent.playerId === youId;

  const banner = () => {
    if (mode === 'pick-end') return <span className="text-gold">Chọn lá ở đầu bộ để Scout</span>;
    if (mode === 'place') return <span className="text-gold">Chạm vào chỗ muốn đặt lá — hoặc dùng ◀ ▶</span>;
    if (mode === 'select') return <span className="text-gold">Chọn bộ để đánh ra</span>;
    if (justScouted)
      return <span className="text-teal">Scout xong bạn vẫn giữ lượt — Show hoặc Scout tiếp</span>;
    return isMyTurn ? (
      <span className="text-teal">Tới lượt bạn!</span>
    ) : (
      <span className="text-cream/50">Đang chờ {turnName}…</span>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ------------------------------------------------------- header */}
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3 sm:gap-3">
        <Logo compact />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="display whitespace-nowrap text-xs font-bold text-cream sm:text-sm">
            Vòng {state.round}/{state.totalRounds}
          </div>
          <div className="whitespace-nowrap text-[10px] text-cream/50 sm:text-[11px]">
            <span className="hidden sm:inline">Phòng </span>
            <span className="display font-bold tracking-widest text-gold">{state.roomCode}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          className="btn btn-ghost !px-2.5 !py-1"
          aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M11 5 6 9H2v6h4l5 4z" />
            {muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setPanel((v) => (v === 'chat' ? null : 'chat'))}
          className="btn btn-ghost relative flex items-center gap-1.5 whitespace-nowrap !px-2.5 !py-1 text-xs sm:text-sm"
          aria-label={unread ? `Chat, ${unread} tin chưa đọc` : 'Chat'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          <span className="hidden sm:inline">Chat</span>
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-crimson px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPanel((v) => (v === 'log' ? null : 'log'))}
          className="btn btn-ghost hidden whitespace-nowrap !px-2.5 !py-1 text-xs sm:block sm:text-sm"
        >
          Nhật ký
        </button>
        <button
          type="button"
          onClick={onShowRules}
          className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 text-xs sm:text-sm"
        >
          Luật
        </button>
      </header>

      {/* ---------------------------------------------- across the table */}
      <div
        className={`mt-2.5 grid shrink-0 gap-2 px-3 ${
          others.length >= 3 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {others.map((p) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isTurn={state.players[state.currentPlayer]?.id === p.id}
            isStart={state.players[state.startingPlayer]?.id === p.id}
            hideScoutShow={state.twoPlayer}
            dense={others.length >= 3}
            bubble={bubbles.get(p.id)}
          />
        ))}
      </div>

      {/* --------------------------------------------------------- felt */}
      <TableCenter
        state={state}
        youId={youId}
        pickingEnd={mode === 'pick-end'}
        chosenEnd={placing ? end : null}
        onPickEnd={(e) => {
          sfx.select();
          pickEnd(e);
        }}
      />

      <div className="relative flex h-6 shrink-0 items-center justify-center px-3 text-center">
        <AnimatePresence initial={false}>
          <motion.div
            key={`${state.currentPlayer}-${mode}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            className="display absolute text-sm font-bold"
          >
            {banner()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---------------------------------------------------- your chair */}
      <div className="mt-1 shrink-0">
        {me && (
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar index={me.avatar} size={34} ring={isMyTurn ? GOLD : undefined} />
                {iAmStarter && (
                  <span className="absolute -left-2 -top-2">
                    <StartMarker size={17} />
                  </span>
                )}
              </div>
              <div className="relative leading-tight">
                <AnimatePresence>
                  {bubbles.get(me.id) && (
                    <motion.div
                      key={bubbles.get(me.id)}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute bottom-full left-0 z-30 mb-1.5 w-max max-w-[14rem] rounded-xl rounded-bl-sm bg-cream px-2.5 py-1.5 text-xs font-medium leading-snug text-ink shadow-lg"
                    >
                      {bubbles.get(me.id)}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="display text-sm font-bold text-cream">{me.name}</div>
                <div className="display text-[11px] font-bold text-gold tabular-nums">{me.totalScore} điểm</div>
              </div>
            </div>

            <div className="flex items-end gap-3">
              {me.scoutChips > 0 && <ChipStack count={me.scoutChips} size={20} />}
              <CardPile count={me.scoreCards} size={18} label="Lá bạn đã ăn" />
              {!state.twoPlayer && (
                <span className={me.scoutShowAvailable ? '' : 'opacity-45'}>
                  <ScoutShowToken size={26} used={!me.scoutShowAvailable} />
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl px-2 pt-1">
          <Hand
            hand={workingHand}
            selection={selection}
            onCardClick={(i) => {
              if (mode === 'place') {
                sfx.chip();
                setInsertAt(i);
                return;
              }
              sfx.select();
              setSelection((s) => toggleSelection(s, i));
            }}
            playableStarts={playableStarts}
            interactive={isMyTurn && (mode === 'idle' || mode === 'place' || mode === 'select')}
            placing={placing}
            placedIndex={placing ? insertAt : null}
          />
        </div>

        {/* ------------------------------------------------- action bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 [&>.btn]:!px-3 [&>.btn]:!py-2 [&>.btn]:text-sm sm:[&>.btn]:!px-5 sm:[&>.btn]:!py-2.5 sm:[&>.btn]:text-base">
          {!isMyTurn && <div className="display py-1.5 text-sm text-cream/45">Chờ tới lượt bạn…</div>}

          {isMyTurn && mode === 'idle' && (
            <>
              <button type="button" disabled={!showCheck?.ok} onClick={submitShow} className="btn btn-gold min-w-32 tabular-nums">
                Show{selection && ` (${selectionIndices(selection).length})`}
              </button>
              <button
                type="button"
                disabled={!priv.canScout}
                onClick={() => beginScout(false)}
                className="btn btn-teal"
              >
                Scout
              </button>
              {!state.twoPlayer && (
                <button
                  type="button"
                  disabled={!priv.canScoutShow}
                  onClick={() => beginScout(true)}
                  className="btn btn-crimson flex items-center gap-2"
                >
                  <ScoutShowToken size={20} used={!me?.scoutShowAvailable} />
                  Scout &amp; Show
                </button>
              )}
            </>
          )}

          {isMyTurn && mode === 'place' && (
            <>
              <button type="button" onClick={() => nudge(-1)} disabled={insertAt === 0} className="btn btn-ghost !px-3">
                ◀
              </button>
              <button
                type="button"
                onClick={() => nudge(1)}
                disabled={insertAt >= priv.hand.length}
                className="btn btn-ghost !px-3"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.tap();
                  setFlip((f) => !f);
                }}
                className="btn btn-ghost"
              >
                ↻ Lật
                {scoutCard && <span className="display ml-1.5 font-extrabold text-gold">{value(scoutCard)}</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scoutAndShow) {
                    sfx.select();
                    setMode('select');
                  } else {
                    submitScout();
                  }
                }}
                className="btn btn-gold min-w-32 tabular-nums"
              >
                {scoutAndShow ? 'Đặt xong →' : 'Xác nhận'}
              </button>
              <button type="button" onClick={cancel} className="btn btn-ghost">
                Huỷ
              </button>
            </>
          )}

          {isMyTurn && mode === 'select' && (
            <>
              <button type="button" disabled={!showCheck?.ok} onClick={submitShow} className="btn btn-gold min-w-32 tabular-nums">
                Scout &amp; Show{selection && ` (${selectionIndices(selection).length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.tap();
                  setSelection(null);
                  setMode('place');
                }}
                className="btn btn-ghost"
              >
                ← Đặt lại
              </button>
              <button type="button" onClick={cancel} className="btn btn-ghost">
                Huỷ
              </button>
            </>
          )}

          {isMyTurn && mode === 'pick-end' && (
            <button type="button" onClick={cancel} className="btn btn-ghost">
              Huỷ
            </button>
          )}
        </div>

        {/* why the current selection is not allowed — the line keeps its
            height when empty, so the table above never jumps */}
        <div className="flex h-6 items-start justify-center px-3 text-center text-xs text-crimson" aria-live="polite">
          <AnimatePresence>
            {isMyTurn && showCheck && !showCheck.ok && (
              <motion.span
                key={showCheck.reason}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="truncate"
              >
                {showCheck.reason}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ------------------------------------------------ chat + log */}
      <AnimatePresence>
        {panel && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="panel fixed right-0 top-0 z-30 flex h-dvh w-full max-w-sm flex-col rounded-l-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-1 rounded-xl bg-ink p-1 text-sm">
                {(
                  [
                    ['chat', 'Chat'],
                    ['log', 'Nhật ký'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPanel(key)}
                    className={`display flex-1 rounded-lg py-1 font-bold transition-colors ${
                      panel === key ? 'bg-ink-3 text-cream' : 'text-cream/45 hover:text-cream/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="btn btn-ghost !px-2.5 !py-1 text-xs"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {panel === 'chat' ? (
              <ChatBox messages={chat} youId={youId} onSend={onSendChat} autoFocus className="mt-3 flex-1" />
            ) : (
              <>
                <ul className="scrollbar-thin mt-3 flex-1 space-y-1 overflow-y-auto pr-1 text-xs">
                  {[...state.log].reverse().map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-lg px-2 py-1.5 ${
                        entry.kind === 'round'
                          ? 'bg-gold/10 font-semibold text-gold'
                          : entry.kind === 'show'
                            ? 'bg-ink-3 text-cream/85'
                            : 'text-cream/55'
                      }`}
                    >
                      {entry.text}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={onLeave} className="btn btn-ghost mt-3 w-full text-sm">
                  Rời phòng
                </button>
              </>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
