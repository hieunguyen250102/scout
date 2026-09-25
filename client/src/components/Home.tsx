/**
 * Landing screen. Signing in comes first: an email, then the 6-digit code
 * that was mailed to it. Only then can you pick a name and a face and
 * create or join a table.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AVATAR_COLORS } from '../lib/theme';
import { useEmailLogin } from 'oink-kit/react';
import { authClient, type Session } from '../lib/net';
import { Avatar } from './PlayerSeat';
import { Logo } from './Logo';
import { sfx } from '../lib/sound';

interface Props {
  session: Session | null;
  onLogin: (session: Session) => void;
  onLogout: () => void;
  name: string;
  avatar: number;
  onIdentity: (name: string, avatar: number) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  connected: boolean;
  onShowRules: () => void;
  initialCode?: string;
}

export function Home(props: Props) {
  const { session, connected, onShowRules } = props;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Logo />

        <p className="mt-3 text-center text-sm leading-relaxed text-cream/55">
          Ghép đội hình mạnh hơn đối thủ — nhưng không được xếp lại bài trên tay.
        </p>

        <div className="panel mt-6 rounded-2xl p-5">
          {/* Swap immediately; the fade is only decoration, so a paused
              animation (e.g. a background tab) can never hold the form back. */}
          <motion.div
            key={session ? 'play' : 'login'}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {session ? <PlayForm {...props} session={session} /> : <LoginForm onLogin={props.onLogin} />}
          </motion.div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={onShowRules}
            className="text-cream/60 underline-offset-4 hover:text-cream hover:underline"
          >
            Luật chơi
          </button>
          <span className="flex items-center gap-1.5 text-cream/40">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-teal' : 'animate-pulse bg-crimson'}`} />
            {connected ? 'Đã kết nối máy chủ' : 'Đang kết nối…'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------------------- login */

function LoginForm({ onLogin }: { onLogin: (s: Session) => void }) {
  const login = useEmailLogin(authClient, {
    onLogin: (s) => {
      sfx.turn();
      onLogin(s);
    },
    onSent: sfx.chip,
    onError: sfx.error,
  });
  const { email, code, busy, error, notice, devCode, cooldown } = login;

  if (login.step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login.send();
        }}
      >
        <h2 className="display text-lg font-bold text-cream">Đăng nhập</h2>
        <p className="mt-0.5 text-xs text-cream/50">Nhập email, chúng tôi sẽ gửi cho bạn một mã 6 số.</p>

        <label className="label mt-4" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => login.setEmail(e.target.value)}
          placeholder="ban@vidu.com"
          className="field mt-1.5"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}

        <button type="submit" disabled={!login.emailOk || busy} className="btn btn-gold mt-4 w-full">
          {busy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void login.verify();
      }}
    >
      <h2 className="display text-lg font-bold text-cream">Nhập mã</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-cream/50">
        Đã gửi mã tới <span className="font-semibold text-cream/80">{email.trim()}</span>. Xem cả thư mục Spam nếu chưa
        thấy.
      </p>

      <input
        ref={login.codeRef}
        value={code}
        onChange={(e) => login.typeCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        aria-label="Mã 6 số"
        className="field display mt-4 text-center text-3xl font-extrabold tracking-[0.5em] placeholder:tracking-[0.5em]"
        autoFocus
      />
      {devCode && (
        <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-cream/55">
          Máy chủ chưa cấu hình gửi mail (chế độ dev) — mã là{' '}
          <button type="button" className="font-bold text-gold underline" onClick={() => void login.verify(devCode)}>
            {devCode}
          </button>
        </p>
      )}
      {notice && !error && <p className="mt-2 text-xs text-gold">{notice}</p>}
      {error && <p className="mt-2 text-xs text-crimson">{error}</p>}

      <button type="submit" disabled={code.length !== 6 || busy} className="btn btn-gold mt-4 w-full">
        {busy ? 'Đang kiểm tra…' : 'Xác nhận'}
      </button>

      <div className="mt-3 flex items-center justify-between text-xs">
        <button type="button" onClick={login.changeEmail} className="text-cream/55 hover:text-cream">
          ← Đổi email
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => void login.send()}
          className="text-gold disabled:text-cream/30"
        >
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- play */

function PlayForm({
  session,
  onLogout,
  name,
  avatar,
  onIdentity,
  onCreate,
  onJoin,
  connected,
  initialCode,
}: Props & { session: Session }) {
  const [code, setCode] = useState(initialCode ?? '');
  const canPlay = connected && name.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-ink px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-cream/60">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
          <span className="truncate">{session.user.email}</span>
        </span>
        <button type="button" onClick={onLogout} className="shrink-0 text-cream/45 hover:text-cream">
          Đăng xuất
        </button>
      </div>

      <label className="label mt-4" htmlFor="player-name">
        Tên hiển thị
      </label>
      <input
        id="player-name"
        value={name}
        maxLength={14}
        onChange={(e) => onIdentity(e.target.value, avatar)}
        placeholder="Bầu gánh xiếc…"
        className="field display mt-1.5 text-lg font-bold"
      />

      <span className="label mt-4">Chọn mặt nạ</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {AVATAR_COLORS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              sfx.tap();
              onIdentity(name, i);
            }}
            className={`rounded-full transition ${
              avatar === i ? 'ring-2 ring-gold ring-offset-2 ring-offset-ink-2' : 'opacity-55 hover:opacity-100'
            }`}
            aria-label={`Mặt nạ ${i + 1}`}
            aria-pressed={avatar === i}
          >
            <Avatar index={i} size={34} />
          </button>
        ))}
      </div>

      <div className="gold-rule my-5" />

      {session.user.canHost ? (
        <>
          <button
            type="button"
            disabled={!canPlay}
            onClick={() => {
              sfx.turn();
              onCreate();
            }}
            className="btn btn-gold w-full text-base"
          >
            Tạo phòng mới
          </button>

          <div className="my-3 flex items-center gap-3 text-[11px] text-cream/35">
            <span className="h-px flex-1 bg-white/10" />
            hoặc vào phòng có sẵn
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      ) : (
        <p className="mb-3 text-xs leading-relaxed text-cream/50">
          Nhập mã phòng mà chủ bàn gửi cho bạn để vào chơi.
        </p>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canPlay || code.length < 4) return;
          sfx.turn();
          onJoin(code);
        }}
      >
        <input
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 4),
            )
          }
          placeholder="MÃ PHÒNG"
          aria-label="Mã phòng"
          className="field display min-w-0 text-center text-lg font-extrabold tracking-[0.35em] placeholder:text-sm placeholder:font-semibold placeholder:tracking-[0.2em]"
        />
        <button
          type="submit"
          disabled={!canPlay || code.length < 4}
          className={`btn shrink-0 ${session.user.canHost ? 'btn-ghost' : 'btn-gold'}`}
        >
          Vào
        </button>
      </form>
    </div>
  );
}
