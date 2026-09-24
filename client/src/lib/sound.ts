/**
 * Tiny WebAudio blips — no asset downloads, no licences, and they can be
 * muted with one switch. Everything is synthesised on the fly.
 */

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem('scout.muted') === '1';
} catch {
  /* ignore */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('scout.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, gain = 0.14, type: OscillatorType = 'triangle'): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  env.gain.setValueAtTime(0.0001, ac.currentTime + start);
  env.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(env).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

export const sfx = {
  tap: () => tone(520, 0, 0.07, 0.07, 'square'),
  select: () => tone(760, 0, 0.09, 0.08),
  deal: () => tone(320, 0, 0.06, 0.05, 'square'),
  show: () => {
    tone(523, 0, 0.12);
    tone(784, 0.06, 0.16);
  },
  scout: () => {
    tone(392, 0, 0.1);
    tone(587, 0.05, 0.12);
  },
  chip: () => tone(1050, 0, 0.08, 0.09, 'sine'),
  turn: () => {
    tone(659, 0, 0.1);
    tone(880, 0.08, 0.14);
  },
  roundEnd: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.12));
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.3, 0.13));
  },
  chat: () => tone(990, 0, 0.07, 0.05, 'sine'),
  error: () => tone(160, 0, 0.16, 0.1, 'sawtooth'),
};
