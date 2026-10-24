/**
 * Audio (§8): two seamless looping BGM tracks (calm hub / tense battle) and
 * short SFX — all synthesized with WebAudio, zero asset weight for the TMA.
 * Sound never starts before the first tap; mute is persisted by the store.
 */

export type SfxName =
  | 'tap' | 'attack' | 'crit' | 'death' | 'heal' | 'levelup'
  | 'summon' | 'forge' | 'victory' | 'defeat' | 'coins' | 'cast';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
let muted = false;
let bgmTimer: number | null = null;
let currentTrack: 'hub' | 'battle' | null = null;
let step = 0;

const DEFAULT_VOLUME = 0.5; // «Громкость по умолчанию — не максимум»

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor: typeof AudioContext | undefined = 'AudioContext' in window ? window.AudioContext : w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = DEFAULT_VOLUME;
    master.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.35;
    bgmGain.connect(master);
  }
  return ctx;
}

/** First tap anywhere in the app calls this — unlocks audio on iOS/Android WebView. */
export function initAudio(): void {
  const c = ac();
  if (c?.state === 'suspended') void c.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : DEFAULT_VOLUME, ctx.currentTime, 0.05);
  if (m) stopBgm();
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, dest?: AudioNode): void {
  const c = ac();
  if (!c || !master || muted) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g);
  g.connect(dest ?? master);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, vol: number, filterFreq: number): void {
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
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();
}

export function playSfx(name: SfxName): void {
  switch (name) {
    case 'tap': tone(520, 0.07, 'sine', 0.25); break;
    case 'attack': tone(220, 0.12, 'square', 0.18, 120); noise(0.08, 0.12, 1800); break;
    case 'crit': tone(340, 0.2, 'sawtooth', 0.25, 90); noise(0.12, 0.2, 3200); break;
    case 'death': tone(180, 0.4, 'triangle', 0.25, 45); noise(0.25, 0.12, 700); break;
    case 'heal': tone(520, 0.18, 'sine', 0.2, 780); tone(660, 0.22, 'sine', 0.14, 880); break;
    case 'cast': tone(300, 0.25, 'sine', 0.16, 620); break;
    case 'levelup': [440, 554, 659, 880].forEach((f, i) => setTimeout(() => { tone(f, 0.16, 'triangle', 0.22); }, i * 70)); break;
    case 'summon': tone(200, 0.6, 'sine', 0.2, 900); noise(0.4, 0.08, 2400); break;
    case 'forge': noise(0.15, 0.3, 5200); tone(140, 0.3, 'square', 0.2, 70); break;
    case 'victory': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => { tone(f, 0.22, 'triangle', 0.25); }, i * 110)); break;
    case 'defeat': [392, 330, 262, 196].forEach((f, i) => setTimeout(() => { tone(f, 0.28, 'sine', 0.22); }, i * 140)); break;
    case 'coins': [980, 1310].forEach((f, i) => setTimeout(() => { tone(f, 0.09, 'square', 0.12); }, i * 60)); break;
  }
}

/* ---------------------------------- BGM ---------------------------------- */

// hub: A-minor calm arpeggio; battle: faster, lower, tense
const HUB_NOTES = [220, 261.6, 329.6, 392, 329.6, 261.6];
const BATTLE_NOTES = [146.8, 174.6, 146.8, 220, 164.8, 196];

function scheduleBgmStep(): void {
  const c = ac();
  if (!c || !bgmGain || muted || !currentTrack) return;
  const notes = currentTrack === 'hub' ? HUB_NOTES : BATTLE_NOTES;
  const freq = notes[step % notes.length] ?? 220;
  const type: OscillatorType = currentTrack === 'hub' ? 'sine' : 'triangle';
  tone(freq, currentTrack === 'hub' ? 0.5 : 0.28, type, currentTrack === 'hub' ? 0.1 : 0.12, undefined, bgmGain);
  if (currentTrack === 'battle' && step % 2 === 0) tone(freq / 2, 0.14, 'square', 0.06, undefined, bgmGain);
  step++;
}

export function playBgm(track: 'hub' | 'battle'): void {
  if (muted || currentTrack === track) return;
  currentTrack = track;
  step = 0;
  if (bgmTimer !== null) window.clearInterval(bgmTimer);
  const interval = track === 'hub' ? 480 : 260;
  scheduleBgmStep();
  bgmTimer = window.setInterval(scheduleBgmStep, interval);
}

export function stopBgm(): void {
  currentTrack = null;
  if (bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

/** Pause on WebView hide / Telegram minimize (§8). */
export function suspendAudio(): void {
  if (ctx?.state === 'running') void ctx.suspend();
}

export function resumeAudio(): void {
  if (ctx?.state === 'suspended' && !muted) void ctx.resume();
}
