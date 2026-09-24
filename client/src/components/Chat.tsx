/** Table talk: a message list with a composer, used in the lobby and the side panel. */

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@shared/types';
import { Avatar } from './PlayerSeat';

/** A message plus when *this* browser received it (0 for history), for seat bubbles. */
export type ChatItem = ChatMessage & { recvAt: number };

const QUICK = ['👍', 'Hay!', 'Hic 😅', 'GG'];

function time(at: number) {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

interface Props {
  messages: ChatItem[];
  youId: string;
  onSend: (text: string) => void;
  autoFocus?: boolean;
  className?: string;
}

export function ChatBox({ messages, youId, onSend, autoFocus, className = '' }: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the newest message, the way every chat does.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-6 text-center text-xs text-cream/35">
            Chưa có tin nhắn nào — chào mọi người một câu đi!
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.playerId === youId;
          const grouped = i > 0 && messages[i - 1].playerId === m.playerId && m.at - messages[i - 1].at < 60_000;
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '!mt-0.5' : ''}`}
            >
              {!mine && (
                <span className={`shrink-0 ${grouped ? 'invisible' : ''}`}>
                  <Avatar index={m.avatar} size={24} />
                </span>
              )}
              <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!grouped && (
                  <div className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[10px] text-cream/40">
                    {!mine && <span className="font-semibold text-cream/65">{m.name}</span>}
                    <span className="tabular-nums">{time(m.at)}</span>
                  </div>
                )}
                <div
                  className={`break-words rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                    mine ? 'rounded-br-md bg-gold/90 text-ink' : 'rounded-bl-md bg-ink-3 text-cream/90'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-cream/70 hover:bg-white/5"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={240}
          autoFocus={autoFocus}
          placeholder="Nhắn gì đó…"
          aria-label="Tin nhắn"
          className="field min-w-0 flex-1 !py-2 text-sm"
        />
        <button type="submit" disabled={!draft.trim()} className="btn btn-gold !px-3.5 !py-2 text-sm" aria-label="Gửi">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
