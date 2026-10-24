import type { WeaponId } from '../game/types';

/**
 * Процедурный звук «Хамсина» на WebAudio: сухие щелчки пустыни,
 * характер каждого ствола, рёв титана, ветер в вылазке.
 * Без внешних ассетов; ctx создаётся лениво после первого жеста.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let windSrc: AudioBufferSourceNode | null = null;
let muted = false;

function ensure(): Ctx | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

function out(): GainNode | null {
  return master;
}

export function unlockAudio(): void {
  ensure();
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.02);
  if (v) stopWind();
}

function noise(c: Ctx, dur: number, gainV: number, type: BiquadFilterType, freq: number, dest: AudioNode, q = 1): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(gainV, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(c: Ctx, type: OscillatorType, f0: number, f1: number, dur: number, gainV: number, dest: AudioNode, delay = 0): void {
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(gainV, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** выстрел игрока — тембр зависит от ствола */
export function sfxShot(weapon: WeaponId, dist = 0): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  const at = Math.max(0, Math.min(0.8, dist / 40));
  switch (weapon) {
    case 'pistol':
      noise(c, 0.09, 0.5, 'bandpass', 1800, m, 0.8);
      tone(c, 'square', 220, 60, 0.08, 0.25, m);
      break;
    case 'smg':
      noise(c, 0.07, 0.42, 'bandpass', 2400, m, 0.9);
      tone(c, 'square', 280, 80, 0.06, 0.18, m);
      break;
    case 'rifle':
      noise(c, 0.11, 0.55, 'bandpass', 1500, m, 0.7);
      tone(c, 'sawtooth', 180, 45, 0.1, 0.3, m);
      break;
    case 'shotgun':
      noise(c, 0.22, 0.7, 'lowpass', 1400, m);
      tone(c, 'triangle', 120, 35, 0.18, 0.45, m);
      break;
    case 'sniper':
      noise(c, 0.3, 0.75, 'bandpass', 1200, m, 0.5);
      tone(c, 'sawtooth', 150, 30, 0.25, 0.4, m);
      tone(c, 'sine', 900, 200, 0.12, 0.12, m, 0.01);
      break;
  }
  if (at > 0.05) { // хвост эха для дальних выстрелов
    noise(c, 0.25, 0.08 * at, 'lowpass', 600, m);
  }
}

/** вражеский выстрел рядом/вдалеке */
export function sfxEnemyShot(dist: number): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  const near = Math.max(0.15, 1 - dist / 45);
  noise(c, 0.1, 0.3 * near, 'bandpass', 1100, m, 0.7);
  tone(c, 'square', 160, 50, 0.07, 0.14 * near, m);
}

export function sfxRicochet(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  const f = 2400 + Math.random() * 1800;
  tone(c, 'sine', f, f * 0.55, 0.09, 0.06, m);
}

export function sfxHitmarker(head: boolean): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'square', head ? 1500 : 900, head ? 2100 : 1100, 0.05, head ? 0.16 : 0.1, m);
}

export function sfxDryFire(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.035, 0.18, 'highpass', 3000, m);
}

export function sfxReload(stage: 'out' | 'in'): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  if (stage === 'out') {
    noise(c, 0.07, 0.2, 'bandpass', 900, m, 2);
    tone(c, 'square', 300, 200, 0.05, 0.07, m);
  } else {
    noise(c, 0.06, 0.25, 'bandpass', 1400, m, 2);
    tone(c, 'square', 500, 350, 0.04, 0.09, m, 0.02);
  }
}

export function sfxSwitch(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.06, 0.14, 'bandpass', 1200, m, 1.5);
}

export function sfxFootstep(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.075, 0.12 + Math.random() * 0.05, 'lowpass', 700 + Math.random() * 300, m);
}

export function sfxJump(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.09, 0.1, 'lowpass', 900, m);
}

export function sfxLand(hard: boolean): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, hard ? 0.16 : 0.1, hard ? 0.3 : 0.14, 'lowpass', hard ? 500 : 800, m);
  if (hard) tone(c, 'triangle', 90, 40, 0.12, 0.2, m);
}

export function sfxDash(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.22, 0.2, 'bandpass', 700, m, 0.6);
}

export function sfxExplosion(dist = 0): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  const near = Math.max(0.2, 1 - dist / 40);
  tone(c, 'triangle', 110, 28, 0.6 * near, 0.7 * near, m);
  noise(c, 0.55, 0.5 * near, 'lowpass', 900, m);
  noise(c, 0.3, 0.16 * near, 'bandpass', 2600, m, 0.7);
}

export function sfxHurt(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'triangle', 200, 90, 0.14, 0.3, m);
  noise(c, 0.1, 0.18, 'lowpass', 500, m);
}

export function sfxDeath(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'sawtooth', 220, 40, 1.2, 0.3, m);
  tone(c, 'triangle', 110, 30, 1.4, 0.25, m, 0.1);
}

export function sfxEnemyDie(big: boolean): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  if (big) {
    tone(c, 'sawtooth', 130, 40, 0.5, 0.28, m);
    noise(c, 0.4, 0.22, 'lowpass', 600, m);
  } else {
    tone(c, 'square', 240, 120, 0.12, 0.08, m);
  }
}

export function sfxTitanRoar(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'sawtooth', 90, 45, 0.9, 0.4, m);
  tone(c, 'square', 60, 35, 0.8, 0.2, m, 0.05);
  noise(c, 0.7, 0.15, 'lowpass', 400, m);
}

export function sfxSpitHiss(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.35, 0.2, 'bandpass', 2200, m, 0.8);
  tone(c, 'sine', 700, 300, 0.3, 0.08, m);
}

export function sfxSplash(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  noise(c, 0.3, 0.35, 'bandpass', 800, m, 0.6);
  tone(c, 'sine', 300, 80, 0.25, 0.15, m);
}

export function sfxPickup(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'sine', 700, 1400, 0.1, 0.14, m);
  tone(c, 'sine', 1050, 2100, 0.08, 0.08, m, 0.05);
}

export function sfxBuy(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'square', 500, 500, 0.05, 0.09, m);
  tone(c, 'square', 750, 750, 0.07, 0.09, m, 0.06);
}

export function sfxDeny(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'square', 180, 140, 0.14, 0.12, m);
}

export function sfxLevelUp(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'triangle', 523, 523, 0.14, 0.16, m);
  tone(c, 'triangle', 659, 659, 0.14, 0.16, m, 0.12);
  tone(c, 'triangle', 784, 784, 0.14, 0.16, m, 0.24);
  tone(c, 'triangle', 1047, 1047, 0.3, 0.18, m, 0.36);
}

export function sfxWaveHorn(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'sawtooth', 140, 138, 0.7, 0.16, m);
  tone(c, 'sawtooth', 210, 207, 0.7, 0.1, m, 0.03);
  noise(c, 0.5, 0.05, 'lowpass', 300, m);
}

export function sfxMedkit(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'sine', 400, 800, 0.3, 0.12, m);
}

export function sfxUi(): void {
  const c = ensure(); const m = out();
  if (!c || !m) return;
  tone(c, 'square', 800, 800, 0.03, 0.05, m);
}

/** зацикленный ветер пустыни — играет во время забега */
export function startWind(): void {
  const c = ensure(); const m = out();
  if (!c || !m || windSrc || !noiseBuf) return;
  windSrc = c.createBufferSource();
  windSrc.buffer = noiseBuf;
  windSrc.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = c.createGain();
  g.gain.value = 0.03;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.015;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  windSrc.connect(f); f.connect(g); g.connect(m);
  windSrc.start();
  lfo.start();
  windSrc.onended = () => { lfo.stop(); };
}

export function stopWind(): void {
  if (windSrc) {
    try { windSrc.stop(); } catch { /* уже остановлен */ }
    windSrc.onended = null;
    windSrc.disconnect();
    windSrc = null;
  }
}

export function disposeAudio(): void {
  stopWind();
  try { void ctx?.close(); } catch { /* уже закрыт */ }
  ctx = null;
  master = null;
  noiseBuf = null;
}
