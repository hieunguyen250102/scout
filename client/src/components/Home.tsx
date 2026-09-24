/**
 * Landing screen. Signing in comes first: an email, then the 6-digit code
 * that was mailed to it. Only then can you pick a name and a face and
 * create or join a table.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AVATAR_COLORS } from '../lib/theme';
import { loadPendingLogin, requestLoginCode, savePendingLogin, verifyLoginCode, type Session } from '../lib/net';
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
  // Coming back from the mail app may have reloaded the page: resume at the code step.
  const [resumed] = useState(loadPendingLogin);
  const [step, setStep] = useState<'email' | 'code'>(resumed ? 'code' : 'email');
  const [email, setEmail] = useState(resumed?.email ?? '');
  const [challenge, setChallenge] = useState(resumed?.challenge ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(() =>
    resumed ? Math.max(0, 60 - Math.floor((Date.now() - resumed.at) / 1000)) : 0,
  );
  const codeRef = useRef<HTMLInputElement>(null);
  // Autofill and a quick Enter can both fire; only one verify may be in flight.
  const verifying = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const send = async () => {
    if (!emailOk || busy) return;
    setBusy(true);
    setError(null);
    const res = await requestLoginCode(email.trim());
    setBusy(false);
    if (!res.ok || !res.challenge) {
      if (res.retryIn) {
        setCooldown(res.retryIn);
        // A code for this address is already on its way — go and type it in,
        // but only if we still hold its challenge; otherwise wait out the cooldown.
        const pending = loadPendingLogin();
        if (pending && pending.email === email.trim()) {
          setChallenge(pending.challenge);
          setStep('code');
        }
      }
      setError(res.error ?? 'Không gửi được mã');
      sfx.error();
      return;
    }
    sfx.chip();
    setChallenge(res.challenge);
    savePendingLogin({ email: email.trim(), challenge: res.challenge, at: Date.now() });
    setNotice(res.warning ?? null);
    setDevCode(res.devCode ?? null);
    setCooldown(60);
    setCode('');
    setStep('code');
    setTimeout(() => codeRef.current?.focus(), 50);
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    const res = await verifyLoginCode(email.trim(), value, challenge);
    verifying.current = false;
    setBusy(false);
    if (!res.ok || !res.token || !res.user) {
      setError(res.error ?? 'Mã không đúng');
      setCode('');
      sfx.error();
      codeRef.current?.focus();
      return;
    }
    sfx.turn();
    savePendingLogin(null);
    onLogin({ token: res.token, user: res.user });
  };

  if (step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
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
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@vidu.com"
          className="field mt-1.5"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}

        <button type="submit" disabled={!emailOk || busy} className="btn btn-gold mt-4 w-full">
          {busy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <h2 className="display text-lg font-bold text-cream">Nhập mã</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-cream/50">
        Đã gửi mã tới <span className="font-semibold text-cream/80">{email.trim()}</span>. Xem cả thư mục Spam nếu chưa
        thấy.
      </p>

      <input
        ref={codeRef}
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6);
          setCode(v);
          if (v.length === 6) void verify(v);
        }}
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
          <button type="button" className="font-bold text-gold underline" onClick={() => void verify(devCode)}>
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
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setError(null);
            setNotice(null);
            setDevCode(null);
            savePendingLogin(null);
          }}
          className="text-cream/55 hover:text-cream"
        >
          ← Đổi email
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => void send()}
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
