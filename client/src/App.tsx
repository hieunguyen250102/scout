/** Connects the socket, holds the authoritative snapshot, picks the screen. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ChatMessage, GameState, PrivateState, ScoutAction } from '@shared/types';
import {
  getSocket,
  loadIdentity,
  loadLastRoom,
  loadSession,
  reconnectSocket,
  saveIdentity,
  saveLastRoom,
  saveSession,
  type Identity,
  type Session,
  type SessionUser,
} from './lib/net';
import { isMuted, setMuted, sfx } from './lib/sound';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { FlipPrompt, GameEnd, RoundEnd, Toast } from './components/Overlays';
import { RulesModal } from './components/RulesModal';
import type { ChatItem } from './components/Chat';

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [identity, setIdentity] = useState<Identity>(loadIdentity);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);

  // The socket effect runs once, so it reads the identity through a ref
  // rather than re-subscribing on every keystroke in the name field.
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const socket = getSocket();
  const youId = session?.user.id ?? '';

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /* ------------------------------------------------------------ socket */

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // A refresh (or a dropped connection) walks straight back into the seat.
      const code = loadLastRoom();
      if (!code || !loadSession()) return;
      const { name, avatar } = identityRef.current;
      socket.emit('room:join', { roomCode: code, name, avatar }, (res: { error?: string }) => {
        if (res?.error) {
          // The room is gone (server restarted, or the game ended long ago).
          saveLastRoom(null);
          setState(null);
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onState = (s: GameState) => setState(s);
    const onPrivate = (p: PrivateState) => setPriv(p);
    const onError = ({ message }: { message: string }) => {
      sfx.error();
      showToast(message);
    };
    // The server tells us who it thinks we are; a stale token means logging in again.
    const onSession = ({ user }: { user: SessionUser | null }) => {
      const local = loadSession();
      if (local && !user) {
        saveSession(null);
        setSession(null);
        setState(null);
        showToast('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
      } else if (local && user && local.user.canHost !== user.canHost) {
        // Host rights live on the server and can change; keep our copy in step.
        const next = { ...local, user };
        saveSession(next);
        setSession(next);
      }
    };
    const onChatHistory = (msgs: ChatMessage[]) => setChat(msgs.map((m) => ({ ...m, recvAt: 0 })));
    const onChatMsg = (m: ChatMessage) => {
      setChat((prev) => [...prev.slice(-79), { ...m, recvAt: Date.now() }]);
      if (m.playerId !== loadSession()?.user.id) sfx.chat();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('private', onPrivate);
    socket.on('errorMsg', onError);
    socket.on('session', onSession);
    socket.on('chat:history', onChatHistory);
    socket.on('chat:msg', onChatMsg);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('private', onPrivate);
      socket.off('errorMsg', onError);
      socket.off('session', onSession);
      socket.off('chat:history', onChatHistory);
      socket.off('chat:msg', onChatMsg);
    };
  }, [socket, showToast]);

  /* ----------------------------------------------------------- actions */

  const login = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
    // First visit: suggest a display name from the email, which they can change.
    setIdentity((prev) => {
      if (prev.name.trim()) return prev;
      const suggested = { ...prev, name: next.user.email.split('@')[0].slice(0, 14) };
      saveIdentity(suggested);
      return suggested;
    });
    reconnectSocket();
  }, []);

  const logout = useCallback(() => {
    socket.emit('room:leave');
    saveSession(null);
    saveLastRoom(null);
    setSession(null);
    setState(null);
    setPriv(null);
    setChat([]);
    reconnectSocket();
  }, [socket]);

  const updateIdentity = useCallback((name: string, avatar: number) => {
    setIdentity((prev) => {
      const next = { ...prev, name, avatar };
      saveIdentity(next);
      return next;
    });
  }, []);

  const createRoom = useCallback(() => {
    const { name, avatar } = identity;
    socket.emit('room:create', { name, avatar }, (res: { roomCode?: string; error?: string }) => {
      if (res?.roomCode) {
        setChat([]);
        saveLastRoom(res.roomCode);
      } else if (res?.error) showToast(res.error);
    });
  }, [socket, identity, showToast]);

  const joinRoom = useCallback(
    (code: string) => {
      const { name, avatar } = identity;
      socket.emit('room:join', { roomCode: code, name, avatar }, (res: { roomCode?: string; error?: string }) => {
        if (res?.roomCode) saveLastRoom(res.roomCode);
        else if (res?.error) showToast(res.error);
      });
    },
    [socket, identity, showToast],
  );

  const leave = useCallback(() => {
    socket.emit('room:leave');
    saveLastRoom(null);
    setState(null);
    setPriv(null);
    setChat([]);
  }, [socket]);

  const sendChat = useCallback((text: string) => socket.emit('chat:send', { text }), [socket]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

  /* ------------------------------------------------------------ render */

  const me = session ? state?.players.find((p) => p.id === youId) : undefined;
  const isHost = !!youId && state?.hostId === youId;

  return (
    <>
      <div className="stage-bg" />
      <Toast message={toast} />

      <AnimatePresence>{rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}</AnimatePresence>

      {!state || !me ? (
        <Home
          session={session}
          onLogin={login}
          onLogout={logout}
          name={identity.name}
          avatar={identity.avatar}
          onIdentity={updateIdentity}
          onCreate={createRoom}
          onJoin={joinRoom}
          connected={connected}
          onShowRules={() => setRulesOpen(true)}
        />
      ) : state.phase === 'lobby' ? (
        <Lobby
          state={state}
          youId={youId}
          onStart={() => socket.emit('game:start')}
          onAddBot={() => socket.emit('room:addBot')}
          onKick={(id) => socket.emit('room:kick', { id })}
          onLeave={leave}
          onShowRules={() => setRulesOpen(true)}
          chat={chat}
          onSendChat={sendChat}
        />
      ) : (
        <>
          <GameBoard
            state={state}
            priv={priv ?? { hand: [], legalShows: [], canScout: false, canScoutShow: false }}
            youId={youId}
            onShow={(indices) => socket.emit('turn:show', { type: 'show', indices })}
            onScout={(action: ScoutAction) => socket.emit('turn:scout', action)}
            onShowRules={() => setRulesOpen(true)}
            onLeave={leave}
            muted={muted}
            onToggleMute={toggleMute}
            chat={chat}
            onSendChat={sendChat}
          />

          <AnimatePresence>
            {state.phase === 'flip' && priv && (
              <FlipPrompt
                key="flip"
                hand={priv.hand}
                players={state.players}
                waiting={me.flipDecided}
                onDecide={(rotate) => socket.emit('round:flip', { rotate })}
              />
            )}
            {state.phase === 'roundEnd' && (
              <RoundEnd
                key="roundEnd"
                state={state}
                youId={youId}
                isHost={!!isHost}
                onNext={() => socket.emit('round:next')}
              />
            )}
            {state.phase === 'gameEnd' && (
              <GameEnd
                key="gameEnd"
                state={state}
                youId={youId}
                isHost={!!isHost}
                onRestart={() => socket.emit('game:restart')}
                onLeave={leave}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
