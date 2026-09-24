/**
 * SCOUT realtime server — Express + Socket.IO.
 * Deploys as a single always-on web service (Render, Fly, Railway…).
 */

import './env';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';

import { Room, ROUND_END_PAUSE_MS } from './room';
import { chooseAction } from './bot';
import { requestCode, verifyCode, verifyToken, type User, hostingIsRestricted } from './auth';
import type { PlayerAction, ScoutAction, ShowAction } from '../../shared/types';

const PORT = Number(process.env.PORT) || 4000;
const ORIGINS = (process.env.CLIENT_ORIGIN ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
// Render (and most hosts) sit behind a proxy; the rate limits need the real client IP.
app.set('trust proxy', 1);
app.use(cors({ origin: ORIGINS.includes('*') ? true : ORIGINS }));
app.use(express.json({ limit: '4kb' }));

const rooms = new Map<string, Room>();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    sockets: io.engine.clientsCount,
    // false means HOST_EMAILS is unset and *anyone* who logs in can open a table
    hostRestricted: hostingIsRestricted(),
    uptime: process.uptime(),
  });
});

/* ------------------------------------------------------------------ auth */

app.post('/auth/request', async (req, res) => {
  const result = await requestCode(req.body?.email, req.ip ?? 'unknown');
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/auth/verify', (req, res) => {
  const result = verifyCode(req.body?.email, req.body?.code, req.body?.challenge);
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/rooms/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'not found' });
  res.json({
    code: room.code,
    phase: room.phase,
    round: room.round,
    turn: room.players[room.currentPlayer]?.name,
    players: room.players.map((p) => ({
      name: p.name,
      bot: p.isBot,
      connected: p.connected,
      cards: p.hand.length,
    })),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGINS.includes('*') ? true : ORIGINS, methods: ['GET', 'POST'] },
  pingInterval: 20000,
  pingTimeout: 25000,
});

/* ------------------------------------------------------------------ utils */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes

function newCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 14) : '';
  return n || 'Người chơi';
}

function cleanAvatar(avatar: unknown): number {
  const a = Number(avatar);
  return Number.isInteger(a) && a >= 0 && a < 8 ? a : 0;
}

const BOT_NAMES = ['Ringo', 'Bella', 'Coco', 'Momo', 'Pippa', 'Zaza', 'Nino'];

function broadcast(room: Room): void {
  io.to(room.code).emit('state', room.publicState());
  for (const p of room.players) {
    if (p.socketId) {
      const priv = room.privateState(p.id);
      if (priv) io.to(p.socketId).emit('private', priv);
    }
  }
}

/** Bots (and abandoned seats) play themselves, with a beat of thinking time. */
const pending = new Map<string, NodeJS.Timeout>();

/** Nobody should be stuck staring at a summary because the host walked away. */
function scheduleRoundAdvance(room: Room): void {
  const key = `${room.code}:round`;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  if (room.phase !== 'roundEnd') return;

  const timer = setTimeout(() => {
    pending.delete(key);
    if (room.phase !== 'roundEnd') return;
    room.nextRound();
    broadcast(room);
    scheduleAuto(room);
  }, ROUND_END_PAUSE_MS);
  pending.set(key, timer);
}

/** A player who never picks an orientation must not freeze the round either. */
function scheduleFlipTimeout(room: Room): void {
  const key = `${room.code}:flip`;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  if (room.phase !== 'flip') return;

  const timer = setTimeout(() => {
    pending.delete(key);
    if (room.phase !== 'flip') return;
    for (const p of room.players) {
      if (!p.flipDecided && !p.connected) room.decideFlip(p.id, false);
    }
    broadcast(room);
    scheduleAuto(room);
  }, 25000);
  pending.set(key, timer);
}

function scheduleAuto(room: Room): void {
  if (room.phase === 'roundEnd') return scheduleRoundAdvance(room);
  if (room.phase === 'flip') return scheduleFlipTimeout(room);

  const existing = pending.get(room.code);
  if (existing) clearTimeout(existing);

  if (room.phase !== 'playing') return;
  const p = room.current;
  const abandoned = !p.isBot && !p.connected && Date.now() - (p.disconnectedAt ?? 0) > 15000;
  if (!p.isBot && !abandoned) return;

  const delay = p.isBot ? 700 + Math.random() * 900 : 400;
  const timer = setTimeout(() => {
    pending.delete(room.code);
    if (room.phase !== 'playing' || room.current.id !== p.id) return;
    const action = chooseAction(room, p.id);
    if (action) applyAction(room, p.id, action);
    else room.pushLog('system', `${p.name} không thể đi`);
    broadcast(room);
    scheduleAuto(room);
  }, delay);
  pending.set(room.code, timer);
}

function applyAction(room: Room, playerId: string, action: PlayerAction): string | null {
  if (action.type === 'show') return room.show(playerId, action as ShowAction);
  return room.scout(playerId, action as ScoutAction);
}

/** Rooms nobody has touched for an hour are swept away. */
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [code, room] of rooms) {
      const anyoneHome = room.players.some((p) => p.connected && !p.isBot);
      if (!anyoneHome && room.lastActivity < cutoff) {
        for (const key of [code, `${code}:round`, `${code}:flip`]) {
          const t = pending.get(key);
          if (t) clearTimeout(t);
          pending.delete(key);
        }
        rooms.delete(code);
      }
    }
  },
  5 * 60 * 1000,
).unref();

/* ---------------------------------------------------------------- sockets */

type Ack<T> = (res: T) => void;

/** Anyone may connect, but only a signed-in socket gets a seat. */
io.use((socket, next) => {
  socket.data.user = verifyToken(socket.handshake.auth?.token);
  next();
});

const NEED_LOGIN = 'Bạn cần đăng nhập trước';

io.on('connection', (socket: Socket) => {
  const user: User | null = socket.data.user;
  let joinedCode: string | null = null;
  let playerId: string | null = null;
  const chatTimes: number[] = [];

  socket.emit('session', { user });

  const fail = (msg: string) => socket.emit('errorMsg', { message: msg });

  /** The same account open in two tabs: only the newest one owns the seat. */
  const ownsSeat = (room: Room) => !!playerId && room.find(playerId)?.socketId === socket.id;

  socket.on(
    'room:create',
    ({ name, avatar }: { name: string; avatar: number }, ack?: Ack<any>) => {
      if (!user) return ack?.({ error: NEED_LOGIN });
      if (!user.canHost) return ack?.({ error: 'Tài khoản này chỉ được vào bàn, không được tạo bàn' });
      const pid = user.id;
      const code = newCode();
      const room = new Room(code);
      rooms.set(code, room);
      const player = room.addPlayer({ id: pid, name: cleanName(name), avatar: cleanAvatar(avatar), socketId: socket.id });
      if (!player) return ack?.({ error: 'Không tạo được phòng' });
      socket.join(code);
      joinedCode = code;
      playerId = pid;
      ack?.({ roomCode: code });
      socket.emit('chat:history', room.chat);
      broadcast(room);
    },
  );

  socket.on(
    'room:join',
    (
      { roomCode, name, avatar }: { roomCode: string; name: string; avatar: number },
      ack?: Ack<any>,
    ) => {
      if (!user) return ack?.({ error: NEED_LOGIN });
      const pid = user.id;
      const code = (roomCode ?? '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return ack?.({ error: 'Không tìm thấy phòng' });

      const existing = room.find(pid);
      if (existing) {
        // Reconnecting into a seat we already own — works mid-game too.
        room.setConnected(pid, true, socket.id);
      } else {
        const player = room.addPlayer({ id: pid, name: cleanName(name), avatar: cleanAvatar(avatar), socketId: socket.id });
        if (!player) {
          return ack?.({ error: room.phase === 'lobby' ? 'Phòng đã đủ 5 người' : 'Ván đã bắt đầu' });
        }
      }
      socket.join(code);
      joinedCode = code;
      playerId = pid;
      ack?.({ roomCode: code });
      socket.emit('chat:history', room.chat);
      broadcast(room);
      scheduleAuto(room);
    },
  );

  socket.on('room:addBot', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || room.hostId !== playerId) return;
    const used = new Set(room.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.players.length}`;
    room.addPlayer({ id: `bot-${Math.random().toString(36).slice(2, 9)}`, name, avatar: room.players.length % 8, isBot: true });
    broadcast(room);
  });

  socket.on('room:kick', ({ id }: { id: string }) => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || room.hostId !== playerId || room.phase !== 'lobby') return;
    room.removePlayer(id);
    broadcast(room);
  });

  socket.on('game:start', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room) return;
    if (room.hostId !== playerId) return fail('Chỉ chủ phòng mới bắt đầu được');
    const err = room.start();
    if (err) return fail(err);
    broadcast(room);
    scheduleAuto(room);
  });

  socket.on('round:flip', ({ rotate }: { rotate: boolean }) => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId) return;
    const err = room.decideFlip(playerId, rotate);
    if (err) return fail(err);
    broadcast(room);
    scheduleAuto(room);
  });

  socket.on('turn:show', (action: ShowAction) => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId) return;
    const err = room.show(playerId, action);
    if (err) return fail(err);
    broadcast(room);
    scheduleAuto(room);
  });

  socket.on('turn:scout', (action: ScoutAction) => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId) return;
    const err = room.scout(playerId, action);
    broadcast(room);
    if (err) fail(err);
    scheduleAuto(room);
  });

  socket.on('round:next', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room) return;
    if (room.hostId !== playerId) return fail('Chờ chủ phòng tiếp tục');
    const err = room.nextRound();
    if (err) return fail(err);
    broadcast(room);
    scheduleAuto(room);
  });

  socket.on('game:restart', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || room.hostId !== playerId) return;
    room.resetToLobby();
    broadcast(room);
  });

  socket.on('chat:send', ({ text }: { text: string }) => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId || typeof text !== 'string') return;
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > 5000) chatTimes.shift();
    if (chatTimes.length >= 5) return fail('Bạn chat nhanh quá, chậm lại chút');
    const msg = room.addChat(playerId, text);
    if (!msg) return;
    chatTimes.push(now);
    io.to(room.code).emit('chat:msg', msg);
  });

  socket.on('room:leave', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId) return;
    if (!ownsSeat(room)) {
      socket.leave(room.code);
      joinedCode = null;
      return;
    }
    if (room.phase === 'lobby') room.removePlayer(playerId);
    else room.setConnected(playerId, false);
    socket.leave(room.code);
    broadcast(room);
    joinedCode = null;
  });

  socket.on('disconnect', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId || !ownsSeat(room)) return;
    if (room.phase === 'lobby') room.removePlayer(playerId);
    else room.setConnected(playerId, false);
    broadcast(room);
    // Give the seat a grace period before the autopilot takes over.
    setTimeout(() => {
      const still = rooms.get(room.code);
      if (still) scheduleAuto(still);
    }, 16000).unref();
  });
});

server.listen(PORT, () => {
  console.log(`SCOUT server listening on :${PORT}`);
});
