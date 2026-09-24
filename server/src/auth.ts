/**
 * Email sign-in: ask for a code, get it by mail, trade it for a session token.
 *
 * Tokens are HMAC-signed rather than stored, so a server restart (Render's
 * free tier sleeps a lot) does not log everyone out — as long as
 * SESSION_SECRET stays the same.
 */

import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

export interface User {
  /** stable per email, doubles as the player id at the table */
  id: string;
  email: string;
  /** allowed to create tables (see HOST_EMAILS) */
  canHost: boolean;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Emails allowed to create tables; everyone else can only join. Empty = anyone. */
const HOST_EMAILS = new Set(
  (process.env.HOST_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function canHost(email: string): boolean {
  return HOST_EMAILS.size === 0 || HOST_EMAILS.has(email);
}

/**
 * Whether table creation is restricted at all. Exposed on /health so you can
 * tell from outside whether a deployment actually has HOST_EMAILS set —
 * forgetting it silently lets anyone create tables. Never reveals the addresses.
 */
export function hostingIsRestricted(): boolean {
  return HOST_EMAILS.size > 0;
}

const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

const SECRET =
  process.env.SESSION_SECRET ||
  (() => {
    // A fixed secret in development keeps you logged in across `tsx watch` restarts.
    if (!IS_PROD) return 'scout-dev-secret';
    console.warn('[auth] SESSION_SECRET is not set — sessions will not survive a restart.');
    return crypto.randomBytes(32).toString('hex');
  })();

/* ------------------------------------------------------------- mailing */

type Mailer = (to: string, code: string) => Promise<void>;

const FROM = process.env.MAIL_FROM || 'SCOUT <no-reply@scout.local>';

function subject(code: string) {
  return `${code} là mã đăng nhập SCOUT của bạn`;
}

function body(code: string) {
  const text = `Mã đăng nhập SCOUT của bạn: ${code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1b1e24">
  <h2 style="margin:0 0 12px;font-size:18px">Mã đăng nhập SCOUT</h2>
  <p style="margin:0 0 16px;color:#555">Nhập mã này vào trang game để vào chơi:</p>
  <div style="font-size:34px;font-weight:800;letter-spacing:10px;padding:14px 0;text-align:center;background:#f4efe4;border-radius:12px">${code}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#888">Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua email.</p>
</div>`;
  return { text, html };
}

/** Resend talks HTTPS, which keeps working on hosts that block outbound SMTP. */
function resendMailer(apiKey: string): Mailer {
  return async (to, code) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject: subject(code), ...body(code) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  };
}

/**
 * Hands the code to the Vercel function (`api/send-code.js`), which sends it
 * through Gmail SMTP — Render's free plan cannot open SMTP ports itself.
 */
function relayMailer(url: string, secret: string): Mailer {
  return async (to, code) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, code }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Relay ${res.status}: ${await res.text()}`);
  };
}

/** "SCOUT <me@gmail.com>" → { name: 'SCOUT', email: 'me@gmail.com' } */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2].trim() } : { email: from.trim() };
}

/**
 * Brevo also talks HTTPS, and lets you send from a single verified address
 * (a plain Gmail works) without owning a domain.
 */
function brevoMailer(apiKey: string): Mailer {
  const sender = parseFrom(FROM);
  return async (to, code) => {
    const { text, html } = body(code);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject: subject(code),
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  };
}

/** Plain SMTP — fine locally, but blocked on Render's free tier (ports 25/465/587). */
function smtpMailer(): Mailer {
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return async (to, code) => {
    await transport.sendMail({ from: FROM, to, subject: subject(code), ...body(code) });
  };
}

const mailer: Mailer | null = process.env.MAIL_RELAY_URL
  ? relayMailer(process.env.MAIL_RELAY_URL, process.env.MAIL_RELAY_SECRET ?? '')
  : process.env.BREVO_API_KEY
    ? brevoMailer(process.env.BREVO_API_KEY)
    : process.env.RESEND_API_KEY
      ? resendMailer(process.env.RESEND_API_KEY)
      : process.env.SMTP_HOST
        ? smtpMailer()
        : null;

/** Without a mail provider, local development prints the code to the console. */
const DEV_MODE = !mailer && !IS_PROD;

if (!mailer) {
  console.warn(
    DEV_MODE
      ? '[auth] No mail provider configured — login codes are printed here instead.'
      : '[auth] No mail provider configured (MAIL_RELAY_URL, BREVO_API_KEY, RESEND_API_KEY or SMTP_HOST) — nobody can log in.',
  );
}

/* --------------------------------------------------------------- codes */

/*
 * The code itself is never stored. The server hands the browser a signed
 * "challenge" (email, expiry, and a keyed hash of the code) and checks the
 * typed code against it. A Render restart between sending the mail and
 * typing the code — common on the free plan — therefore loses nothing.
 * Only the soft limits (cooldowns, attempt counts, used codes) live in memory.
 */

/** email → when its last code was sent, for the resend cooldown */
const lastSent = new Map<string, number>();
/** challenge nonce → wrong guesses so far */
const attempts = new Map<string, number>();
/** challenge nonce → expiry; a code logs you in once */
const usedNonces = new Map<string, number>();

/** Per-IP budget, so the endpoint cannot be used to spam arbitrary inboxes. */
const ipHits = new Map<string, number[]>();
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 12;

setInterval(() => {
  const now = Date.now();
  for (const [email, t] of lastSent) if (now - t > RESEND_COOLDOWN_MS) lastSent.delete(email);
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
  // attempts outlive their challenge by at most one sweep
  if (attempts.size > 10_000) attempts.clear();
  for (const [ip, hits] of ipHits) {
    const recent = hits.filter((t) => now - t < IP_WINDOW_MS);
    if (recent.length) ipHits.set(ip, recent);
    else ipHits.delete(ip);
  }
}, 60 * 1000).unref();

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

interface Challenge {
  /** email */
  e: string;
  /** nonce */
  n: string;
  /** expiry, epoch ms */
  x: number;
  /** keyed hash of the code */
  h: string;
}

function codeHash(email: string, code: string, nonce: string, exp: number): string {
  return crypto.createHmac('sha256', SECRET).update(`code:${email}:${code}:${nonce}:${exp}`).digest('base64url');
}

function readChallenge(raw: unknown): Challenge | null {
  if (typeof raw !== 'string') return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Challenge;
    return typeof c.e === 'string' && typeof c.n === 'string' && typeof c.x === 'number' && typeof c.h === 'string'
      ? c
      : null;
  } catch {
    return null;
  }
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

export type RequestResult =
  { ok: true; challenge: string; devCode?: string; warning?: string } | { ok: false; error: string; retryIn?: number };

export async function requestCode(rawEmail: unknown, ip: string): Promise<RequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'Email không hợp lệ' };
  if (!mailer && !DEV_MODE) return { ok: false, error: 'Máy chủ chưa cấu hình gửi email' };

  const now = Date.now();
  const sentAt = lastSent.get(email);
  if (sentAt && now - sentAt < RESEND_COOLDOWN_MS) {
    const retryIn = Math.ceil((RESEND_COOLDOWN_MS - (now - sentAt)) / 1000);
    return { ok: false, error: `Đợi ${retryIn}s rồi gửi lại`, retryIn };
  }

  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX) return { ok: false, error: 'Bạn yêu cầu quá nhiều mã, thử lại sau' };
  hits.push(now);
  ipHits.set(ip, hits);

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const n = crypto.randomBytes(9).toString('base64url');
  const x = now + CODE_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ e: email, n, x, h: codeHash(email, code, n, x) })).toString('base64url');
  const challenge = `${payload}.${sign(payload)}`;
  lastSent.set(email, now);

  if (!mailer) {
    console.log(`[auth] login code for ${email}: ${code}`);
    return { ok: true, challenge, devCode: code };
  }
  try {
    await mailer(email, code);
    return { ok: true, challenge };
  } catch (err) {
    // A slow relay may still deliver the mail, so keep the challenge usable.
    if (isTimeout(err)) {
      console.warn(`[auth] mail to ${email} is slow — it may still arrive`);
      return { ok: true, challenge, warning: 'Gửi mail hơi chậm — đợi thêm chút, chưa thấy thì bấm Gửi lại mã' };
    }
    console.error('[auth] sending mail failed:', err);
    lastSent.delete(email);
    return { ok: false, error: 'Không gửi được email, thử lại sau' };
  }
}

export type VerifyResult = { ok: true; token: string; user: User } | { ok: false; error: string };

export function verifyCode(rawEmail: unknown, rawCode: unknown, rawChallenge: unknown): VerifyResult {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : '';
  if (!email || code.length !== 6) return { ok: false, error: 'Mã gồm 6 chữ số' };

  const fail = (reason: string, error: string): VerifyResult => {
    console.warn(`[auth] verify failed for ${email}: ${reason}`);
    return { ok: false, error };
  };

  const c = readChallenge(rawChallenge);
  if (!c) return fail('missing or forged challenge', 'Phiên nhập mã không hợp lệ, hãy gửi mã mới');
  if (c.e !== email) return fail('email mismatch', 'Mã này được gửi cho email khác');
  if (c.x < Date.now()) return fail('expired', 'Mã đã hết hạn (10 phút), hãy gửi mã mới');
  if (usedNonces.has(c.n)) return fail('already used', 'Mã này đã được dùng, hãy gửi mã mới');

  const tries = attempts.get(c.n) ?? 0;
  if (tries >= MAX_ATTEMPTS) return fail('too many attempts', 'Sai quá nhiều lần, hãy gửi mã mới');
  if (!safeEqual(codeHash(email, code, c.n, c.x), c.h)) {
    attempts.set(c.n, tries + 1);
    const left = MAX_ATTEMPTS - tries - 1;
    return fail(
      'wrong code',
      left > 0
        ? `Mã không đúng (còn ${left} lần). Nếu đã bấm gửi lại, hãy dùng mã trong email mới nhất.`
        : 'Sai quá nhiều lần, hãy gửi mã mới',
    );
  }

  usedNonces.set(c.n, c.x);
  attempts.delete(c.n);
  const user = { id: userIdFor(email), email, canHost: canHost(email) };
  return { ok: true, token: signToken(user), user };
}

/* -------------------------------------------------------------- tokens */

function userIdFor(email: string): string {
  return 'u_' + crypto.createHmac('sha256', SECRET).update(`uid:${email}`).digest('base64url').slice(0, 16);
}

function sign(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function signToken(user: User): string {
  const payload = Buffer.from(JSON.stringify({ e: user.email, x: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: unknown): User | null {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { e: string; x: number };
    if (typeof e !== 'string' || typeof x !== 'number' || x < Date.now()) return null;
    return { id: userIdFor(e), email: e, canHost: canHost(e) };
  } catch {
    return null;
  }
}
