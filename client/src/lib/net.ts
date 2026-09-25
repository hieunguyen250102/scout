/** Socket.IO plumbing + the identity we persist so a refresh keeps your seat. */

import { io, type Socket } from 'socket.io-client';
import { createAuthClient } from 'oink-kit/client';

export type { Session, SessionUser, PendingLogin } from 'oink-kit/client';

const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);

/** Email login: session + "code is on its way" state, shared with the other Oink games. */
export const authClient = createAuthClient({ storagePrefix: 'scout', serverUrl: SERVER_URL });

export const { loadSession, saveSession, loadPendingLogin, savePendingLogin } = authClient;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      // read on every (re)connect, so a fresh login takes effect on the next handshake
      auth: authClient.socketAuth,
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
