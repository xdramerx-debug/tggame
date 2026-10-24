/**
 * Synthesized audio: gunshots, moans, impacts — zero asset weight.
 * Sound never starts before the first tap (mobile WebView policy).
 */

export type Sfx =
  | 'shot' | 'reload' | 'dryFire' | 'hitmark' | 'headshot'
  | 'zombieDie' | 'moan' | 'playerHurt' | 'dash'
  | 'waveStart' | 'powerup' | 'gameOver' | 'uiClick';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const MASTER_VOLUME = 0.5;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor: typeof AudioContext | undefined =
      'AudioContext' in window ? window.AudioContext : w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** First tap anywhere — unlocks audio on iOS/Android WebView. */
export function initAudio(): void {
  const c = ac();
  if (c?.state === 'suspended') void c.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05);
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  const c = ac();
  if (!c || !master || muted) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(25, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, vol: number, filterFreq: number, sweepTo?: number): void {
  const c = ac();
  if (!c || !master || muted) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, c.currentTime);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), c.currentTime + dur);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();
}

export function playSfx(name: Sfx): void {
  if (muted) return;
  switch (name) {
    case 'shot':
      noise(0.09, 0.34, 5200, 700);
      tone(150, 0.1, 'square', 0.22, 55);
      break;
    case 'reload':
      tone(700, 0.05, 'square', 0.12);
      window.setTimeout(() => { tone(480, 0.06, 'square', 0.12); }, 130);
      window.setTimeout(() => { tone(900, 0.05, 'square', 0.14); }, 320);
      break;
    case 'dryFire':
      tone(1200, 0.04, 'square', 0.1);
      break;
    case 'hitmark':
      tone(880, 0.05, 'sine', 0.16, 1200);
      break;
    case 'headshot':
      tone(1320, 0.08, 'sine', 0.2, 1760);
      noise(0.06, 0.1, 6000);
      break;
    case 'zombieDie':
      tone(190, 0.34, 'sawtooth', 0.16, 48);
      noise(0.22, 0.14, 900, 240);
      break;
    case 'moan':
      tone(88 + Math.random() * 30, 0.7, 'sawtooth', 0.05, 62);
      break;
    case 'playerHurt':
      tone(110, 0.22, 'triangle', 0.3, 48);
      noise(0.14, 0.2, 1200, 300);
      break;
    case 'dash':
      noise(0.22, 0.16, 2600, 500);
      break;
    case 'waveStart':
      tone(196, 0.5, 'sawtooth', 0.14);
      window.setTimeout(() => { tone(147, 0.7, 'sawtooth', 0.16); }, 260);
      break;
    case 'powerup':
      [523, 659, 784].forEach((f, i) => {
        window.setTimeout(() => { tone(f, 0.14, 'triangle', 0.2); }, i * 70);
      });
      break;
    case 'gameOver':
      [330, 262, 208, 165].forEach((f, i) => {
        window.setTimeout(() => { tone(f, 0.4, 'sine', 0.2); }, i * 220);
      });
      break;
    case 'uiClick':
      tone(600, 0.05, 'sine', 0.16);
      break;
  }
}

/** Suspend on WebView hide. */
export function suspendAudio(): void {
  if (ctx?.state === 'running') void ctx.suspend();
}

export function resumeAudio(): void {
  if (ctx?.state === 'suspended' && !muted) void ctx.resume();
}
