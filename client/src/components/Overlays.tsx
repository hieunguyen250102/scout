/** Full-screen moments: the orientation choice, round scoring, and the finale. */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, GameState } from '@shared/types';
import { rotateHand, value } from '@shared/engine';
import { PlayingCard } from './PlayingCard';
import { Avatar } from './PlayerSeat';
import { ScoreChip } from './Chips';
import { sfx } from '../lib/sound';
import { GOLD } from '../lib/theme';

/* ------------------------------------------------------------ confetti */

export function Confetti({ count = 70 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        color: ['#d4a557', '#c55b50', '#5aa392', '#ece7dd', '#8a5dab'][i % 5],
        size: 6 + Math.random() * 8,
        spin: Math.random() * 720 - 360,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0 block rounded-[2px]"
          style={{ left: `${b.x}%`, width: b.size, height: b.size * 0.6, background: b.color }}
          initial={{ y: -30, opacity: 0, rotate: 0 }}
          animate={{ y: '105vh', opacity: [0, 1, 1, 0], rotate: b.spin }}
          transition={{ duration: b.duration, delay: b.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------- flip prompt */

export function FlipPrompt({
  hand,
  onDecide,
  waiting,
  players,
}: {
  hand: Card[];
  onDecide: (rotate: boolean) => void;
  waiting: boolean;
  players: GameState['players'];
}) {
  const rotated = useMemo(() => rotateHand(hand), [hand]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/85 px-3 py-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="panel w-full max-w-3xl overflow-hidden rounded-3xl p-5"
      >
        <h2 className="display text-center text-2xl font-extrabold text-gold">Chọn hướng bài</h2>
        <p className="mx-auto mt-1 max-w-lg text-center text-sm text-cream/65">
          Đây là lần duy nhất bạn được đổi — xoay cả nắm bài 180° sẽ lật mọi lá <em>và</em> đảo ngược thứ tự.
          Sau đó không được xếp lại nữa.
        </p>

        {waiting ? (
          <div className="py-10 text-center">
            <div className="display animate-pulse text-lg text-cream/70">Đang chờ người khác chọn…</div>
            <div className="mt-4 flex justify-center gap-3">
              {players.map((p) => (
                <div key={p.id} className={`transition-opacity ${p.flipDecided ? 'opacity-100' : 'opacity-30'}`}>
                  <Avatar index={p.avatar} size={34} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {(
              [
                { key: 'keep', label: 'Giữ nguyên', cards: hand, rotate: false },
                { key: 'rotate', label: 'Xoay 180°', cards: rotated, rotate: true },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  sfx.select();
                  onDecide(opt.rotate);
                }}
                className="group block w-full rounded-2xl border border-gold/20 bg-ink/50 p-3 text-left transition-colors hover:border-gold/70 hover:bg-ink/70"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="display font-bold text-cream">{opt.label}</span>
                  <span className="display text-xs text-cream/50">{opt.cards.map(value).join(' · ')}</span>
                </div>
                <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
                  {opt.cards.map((c) => (
                    <div key={c.id} className="w-10 shrink-0 sm:w-12">
                      <PlayingCard card={c} />
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------- round end */

export function RoundEnd({
  state,
  youId,
  isHost,
  onNext,
}: {
  state: GameState;
  youId: string;
  isHost: boolean;
  onNext: () => void;
}) {
  useEffect(() => {
    sfx.roundEnd();
  }, []);

  // The table moves on by itself so an absent host cannot stall everyone.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!state.autoAdvanceAt) return setSecondsLeft(null);
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((state.autoAdvanceAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state.autoAdvanceAt]);

  const ender = state.players.find((p) => p.id === state.roundEnderId);
  const ranked = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
  const last = state.round >= state.totalRounds;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/88 px-3 py-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 24 }}
        className="panel w-full max-w-lg rounded-3xl p-5"
      >
        <h2 className="display text-center text-2xl font-extrabold text-gold">
          Hết vòng {state.round}/{state.totalRounds}
        </h2>
        <p className="mt-1 text-center text-sm text-cream/65">
          {ender?.name}{' '}
          {state.roundEndCondition === 'i' ? 'đã đánh hết bài' : 'giữ bộ mạnh nhất — không ai chặn được'}
        </p>

        <ul className="mt-4 space-y-2">
          {ranked.map((p, i) => {
            const b = p.roundBreakdown;
            return (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.09 }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  p.id === youId ? 'bg-gold/12 ring-1 ring-gold/40' : 'bg-ink/50'
                }`}
              >
                <Avatar index={p.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="display truncate text-sm font-bold text-cream">{p.name}</div>
                  {b && (
                    <div className="text-[11px] text-cream/55 tabular-nums">
                      {b.scoreCards} lá ăn + {b.scoutChips} chip
                      {b.exempt ? ' − 0 (miễn phạt)' : ` − ${b.handPenalty} trên tay`}
                    </div>
                  )}
                </div>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0, rotate: -25 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.3 + i * 0.09, type: 'spring', stiffness: 400, damping: 16 }}
                  className="flex items-center gap-1"
                >
                  <ScoreChip size={22} />
                  <span
                    className={`display text-sm font-extrabold tabular-nums ${
                      (p.roundScore ?? 0) >= 0 ? 'text-teal' : 'text-crimson'
                    }`}
                  >
                    {(p.roundScore ?? 0) >= 0 ? '+' : ''}
                    {p.roundScore}
                  </span>
                </motion.div>
                <div className="display w-10 text-right text-lg font-extrabold text-gold tabular-nums">
                  {p.totalScore}
                </div>
              </motion.li>
            );
          })}
        </ul>

        {isHost ? (
          <button type="button" onClick={onNext} className="btn btn-gold mt-5 w-full">
            {last ? 'Xem kết quả chung cuộc' : `Vòng ${state.round + 1} →`}
            {secondsLeft !== null && <span className="ml-2 opacity-70 tabular-nums">({secondsLeft}s)</span>}
          </button>
        ) : (
          <div className="display mt-5 text-center text-sm text-cream/55">
            {secondsLeft !== null ? (
              <>
                Tiếp tục sau <span className="font-bold text-gold tabular-nums">{secondsLeft}s</span>…
              </>
            ) : (
              'Đang chờ chủ phòng tiếp tục…'
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------ game end */

export function GameEnd({
  state,
  youId,
  isHost,
  onRestart,
  onLeave,
}: {
  state: GameState;
  youId: string;
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    sfx.win();
  }, []);

  const ranked = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
  const youWon = state.winnerIds?.includes(youId);

  return (
    <>
      <Confetti count={110} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-ink/90 px-3 py-6 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 230, damping: 22 }}
          className="panel w-full max-w-lg rounded-3xl p-6 text-center"
        >
          <motion.div
            animate={{ rotate: [0, -6, 6, -4, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.2 }}
            className="mx-auto mb-2 w-fit"
          >
            <svg width="72" height="72" viewBox="0 0 100 100" aria-hidden>
              <path
                d="M50 8l11 24 26 4-19 18 5 26-23-12-23 12 5-26L13 36l26-4z"
                fill={GOLD}
                stroke="#121419"
                strokeWidth="5"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>

          <h2 className="display text-3xl font-extrabold text-gold">
            {youWon ? 'Bạn thắng!' : 'Kết thúc!'}
          </h2>
          <p className="mt-1 text-sm text-cream/65">
            {state.players
              .filter((p) => state.winnerIds?.includes(p.id))
              .map((p) => p.name)
              .join(', ')}{' '}
            là bầu gánh xiếc xuất sắc nhất
          </p>

          <ul className="mt-5 space-y-2 text-left">
            {ranked.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                  state.winnerIds?.includes(p.id) ? 'bg-gold/18 ring-1 ring-gold/50' : 'bg-ink/50'
                }`}
              >
                <span className="display w-5 text-center text-sm font-extrabold text-cream/50">{i + 1}</span>
                <Avatar index={p.avatar} size={34} />
                <span className="display flex-1 truncate font-bold text-cream">{p.name}</span>
                <span className="display text-xl font-extrabold text-gold tabular-nums">{p.totalScore}</span>
              </motion.li>
            ))}
          </ul>

          <div className="mt-6 flex gap-3">
            {isHost && (
              <button type="button" onClick={onRestart} className="btn btn-gold flex-1">
                Chơi lại
              </button>
            )}
            <button type="button" onClick={onLeave} className="btn btn-ghost flex-1">
              Rời phòng
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

/* --------------------------------------------------------------- toast */

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.94 }}
          className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-2xl border border-crimson/60 bg-crimson/90 px-5 py-2.5 text-sm font-bold text-cream shadow-2xl"
          role="status"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
