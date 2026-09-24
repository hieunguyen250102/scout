/** Socket.IO plumbing + the identity we persist so a refresh keeps your seat. */

import { io, type Socket } from 'socket.io-client';

const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      // read on every (re)connect, so a fresh login takes effect on the next handshake
      auth: (cb) => cb({ token: loadSession()?.token ?? null }),
      transports: ['websocket', 'polling'],
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export const serverUrl = SERVER_URL;

/** Reconnect so the server sees the current session token. */
export function reconnectSocket(): void {
  const s = getSocket();
  s.disconnect();
  s.connect();
}

/* -------------------------------------------------------------- session */

export interface SessionUser {
  id: string;
  email: string;
  /** may create tables; everyone else can only join */
  canHost?: boolean;
}

export interface Session {
  token: string;
  user: SessionUser;
}

const SESSION_KEY = 'scout.session.v1';

/**
 * Some in-app browsers and private windows refuse localStorage. Keeping a copy
 * in memory means the socket still gets the token, and the login lasts at
 * least until the tab closes.
 */
let memSession: Session | null = null;

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return memSession;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.token && parsed.user?.id ? parsed : memSession;
  } catch {
    return memSession;
  }
}

export function saveSession(session: Session | null): void {
  memSession = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* non-fatal: memSession carries it */
  }
}

/* A code is on its way: remember where we were, because on a phone switching
   to the mail app can reload this tab. */

export interface PendingLogin {
  email: string;
  challenge: string;
  /** epoch ms the code was requested */
  at: number;
}

const PENDING_KEY = 'scout.pendingLogin.v1';
const PENDING_TTL_MS = 10 * 60 * 1000;
let memPending: PendingLogin | null = null;

export function loadPendingLogin(): PendingLogin | null {
  let p = memPending;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) p = JSON.parse(raw) as PendingLogin;
  } catch {
    /* fall back to memory */
  }
  return p && p.challenge && Date.now() - p.at < PENDING_TTL_MS ? p : null;
}

export function savePendingLogin(p: PendingLogin | null): void {
  memPending = p;
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* memPending carries it */
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ' } as T;
  }
}

export function requestLoginCode(email: string) {
  return post<{
    ok: boolean;
    error?: string;
    retryIn?: number;
    devCode?: string;
    challenge?: string;
    warning?: string;
  }>('/auth/request', { email });
}

export function verifyLoginCode(email: string, code: string, challenge: string) {
  return post<{ ok: boolean; error?: string; token?: string; user?: SessionUser }>('/auth/verify', {
    email,
    code,
    challenge,
  });
}

/* ------------------------------------------------------------- identity */

const KEY = 'scout.identity.v1';

export interface Identity {
  playerId: string;
  name: string;
  avatar: number;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (parsed.playerId) {
        return {
          playerId: parsed.playerId,
          name: parsed.name ?? '',
          avatar: parsed.avatar ?? Math.floor(Math.random() * 8),
        };
      }
    }
  } catch {
    /* storage can be unavailable in private windows — fall through */
  }
  return { playerId: randomId(), name: '', avatar: Math.floor(Math.random() * 8) };
}

export function saveIdentity(id: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    /* non-fatal */
  }
}

/** Remember the room so a reload drops you straight back in. */
const ROOM_KEY = 'scout.room.v1';

export function loadLastRoom(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

export function saveLastRoom(code: string | null): void {
  try {
    if (code) localStorage.setItem(ROOM_KEY, code);
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    /* non-fatal */
  }
}
