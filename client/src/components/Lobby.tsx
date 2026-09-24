/** Waiting room: the room code to share, the seats, and the start button. */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState } from '@shared/types';
import { Avatar } from './PlayerSeat';
import { Logo } from './Logo';
import { sfx } from '../lib/sound';
import { ChatBox, type ChatItem } from './Chat';

interface Props {
  state: GameState;
  youId: string;
  onStart: () => void;
  onAddBot: () => void;
  onKick: (id: string) => void;
  onLeave: () => void;
  onShowRules: () => void;
  chat: ChatItem[];
  onSendChat: (text: string) => void;
}

const SETUP_NOTE: Record<number, string> = {
  2: '11 lá mỗi người · 3 chip Scout · không có Scout & Show · 2 vòng',
  3: '12 lá mỗi người · bỏ hết lá có số 10 · 3 vòng',
  4: '11 lá mỗi người · bỏ lá 9/10 · 4 vòng',
  5: '9 lá mỗi người · dùng đủ 45 lá · 5 vòng',
};

export function Lobby({ state, youId, onStart, onAddBot, onKick, onLeave, onShowRules, chat, onSendChat }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === youId;
  const canStart = state.players.length >= 2;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      setCopied(true);
      sfx.chip();
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked — the code is on screen anyway */
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-5 px-4 py-8 lg:max-w-4xl">
      <Logo />

      <div className="grid w-full gap-5 lg:grid-cols-2">
        <div className="flex w-full flex-col items-center gap-5">
          <motion.button
            type="button"
            onClick={copy}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel group w-full rounded-2xl px-5 py-4 text-center transition-colors hover:bg-ink-3"
          >
            <div className="label">Mã phòng — chạm để chép, gửi cho bạn bè</div>
            <div className="display mt-1 text-5xl font-extrabold tracking-[0.3em] text-gold">{state.roomCode}</div>
            <div className="mt-1 h-4 text-xs text-teal">{copied ? 'Đã chép!' : ''}</div>
          </motion.button>

          <div className="panel w-full rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-base font-bold text-cream">Người chơi ({state.players.length}/5)</h2>
              <span className="text-[11px] text-cream/50">
                {SETUP_NOTE[state.players.length] ?? 'Cần ít nhất 2 người'}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {state.players.map((p, i) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-xl bg-ink px-3 py-2"
                >
                  <Avatar index={p.avatar} size={34} />
                  <span className="display flex-1 truncate font-bold text-cream">
                    {p.name}
                    {p.id === youId && <span className="ml-1.5 text-xs font-medium text-cream/40">(bạn)</span>}
                  </span>
                  {state.hostId === p.id && (
                    <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">CHỦ PHÒNG</span>
                  )}
                  {p.isBot && (
                    <span className="rounded bg-teal/20 px-1.5 py-0.5 text-[10px] font-bold text-teal">BOT</span>
                  )}
                  {isHost && p.id !== youId && (
                    <button
                      type="button"
                      onClick={() => onKick(p.id)}
                      className="rounded-lg px-2 py-0.5 text-xs text-crimson hover:bg-crimson/15"
                      aria-label={`Mời ${p.name} ra`}
                    >
                      ✕
                    </button>
                  )}
                </motion.li>
              ))}
              {Array.from({ length: Math.max(0, 2 - state.players.length) }, (_, i) => (
                <li
                  key={`empty-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-cream/35"
                >
                  <span className="h-[34px] w-[34px] rounded-full border border-dashed border-white/15" />
                  Đang chờ người chơi…
                </li>
              ))}
            </ul>

            {isHost && state.players.length < 5 && (
              <button type="button" onClick={onAddBot} className="btn btn-ghost mt-3 w-full text-sm">
                + Thêm bot
              </button>
            )}
          </div>

          {isHost ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                sfx.roundEnd();
                onStart();
              }}
              className="btn btn-gold w-full text-lg"
            >
              {canStart ? 'Bắt đầu biểu diễn!' : 'Cần ít nhất 2 người'}
            </button>
          ) : (
            <div className="display text-sm text-cream/50">Đang chờ chủ phòng bắt đầu…</div>
          )}
        </div>

        <div className="panel flex h-80 w-full flex-col rounded-2xl p-4 lg:h-auto">
          <h2 className="display text-base font-bold text-cream">Trò chuyện</h2>
          <ChatBox messages={chat} youId={youId} onSend={onSendChat} className="mt-2 flex-1" />
        </div>
      </div>

      <div className="flex gap-4 text-xs">
        <button
          type="button"
          onClick={onShowRules}
          className="text-cream/60 underline-offset-4 hover:text-cream hover:underline"
        >
          Luật chơi
        </button>
        <button type="button" onClick={onLeave} className="text-cream/45 underline-offset-4 hover:underline">
          Rời phòng
        </button>
      </div>
    </div>
  );
}
