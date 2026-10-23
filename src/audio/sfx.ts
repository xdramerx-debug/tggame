type SoundKind =
  | 'slash'
  | 'magic'
  | 'crit'
  | 'heal'
  | 'ult'
  | 'coin'
  | 'levelup'
  | 'ascend'
  | 'summon_epic'
  | 'summon_legend'
  | 'victory'
  | 'tap';

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function getContext(): AudioContext | null {
  if (!soundEnabled || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const win = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = win.AudioContext ?? win.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  delay = 0,
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(30, freqStart), now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.018, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSfx(kind: SoundKind): void {
  const ctx = getContext();
  if (!ctx) return;

  switch (kind) {
    case 'tap':
      playTone(ctx, 560, 740, 0.055, 'triangle', 0.05);
      break;
    case 'slash':
      playTone(ctx, 320, 120, 0.09, 'sawtooth', 0.045);
      playTone(ctx, 880, 420, 0.06, 'triangle', 0.035);
      break;
    case 'magic':
      playTone(ctx, 520, 920, 0.13, 'sine', 0.055);
      playTone(ctx, 780, 1180, 0.11, 'triangle', 0.035, 0.03);
      break;
    case 'crit':
      playTone(ctx, 190, 68, 0.16, 'sawtooth', 0.08);
      playTone(ctx, 980, 1480, 0.11, 'triangle', 0.06, 0.02);
      break;
    case 'heal':
      playTone(ctx, 523.25, 659.25, 0.16, 'sine', 0.05);
      playTone(ctx, 659.25, 1046.5, 0.2, 'sine', 0.05, 0.06);
      break;
    case 'ult':
      playTone(ctx, 130, 55, 0.35, 'sawtooth', 0.085);
      playTone(ctx, 440, 880, 0.24, 'triangle', 0.065, 0.04);
      playTone(ctx, 660, 1320, 0.28, 'sine', 0.06, 0.09);
      break;
    case 'coin':
      playTone(ctx, 880, 1320, 0.09, 'sine', 0.055);
      playTone(ctx, 1175, 1760, 0.12, 'triangle', 0.055, 0.06);
      playTone(ctx, 1568, 2093, 0.14, 'sine', 0.05, 0.12);
      break;
    case 'levelup':
      playTone(ctx, 523.25, 523.25, 0.09, 'triangle', 0.06, 0);
      playTone(ctx, 659.25, 659.25, 0.09, 'triangle', 0.06, 0.06);
      playTone(ctx, 783.99, 783.99, 0.11, 'triangle', 0.06, 0.12);
      playTone(ctx, 1046.5, 1174.6, 0.2, 'sine', 0.065, 0.18);
      break;
    case 'ascend':
      playTone(ctx, 392, 784, 0.22, 'triangle', 0.065, 0);
      playTone(ctx, 587.3, 1174.6, 0.26, 'sine', 0.065, 0.09);
      playTone(ctx, 783.99, 1568, 0.34, 'sine', 0.075, 0.18);
      break;
    case 'summon_epic':
      playTone(ctx, 330, 660, 0.18, 'triangle', 0.065, 0);
      playTone(ctx, 493.88, 987.77, 0.26, 'sine', 0.07, 0.1);
      break;
    case 'summon_legend':
      playTone(ctx, 261.63, 523.25, 0.2, 'sawtooth', 0.06, 0);
      playTone(ctx, 523.25, 1046.5, 0.25, 'triangle', 0.075, 0.08);
      playTone(ctx, 783.99, 1567.98, 0.35, 'sine', 0.085, 0.16);
      playTone(ctx, 1046.5, 2093, 0.42, 'sine', 0.075, 0.24);
      break;
    case 'victory':
      playTone(ctx, 523.25, 523.25, 0.11, 'triangle', 0.065, 0);
      playTone(ctx, 659.25, 659.25, 0.11, 'triangle', 0.065, 0.09);
      playTone(ctx, 783.99, 783.99, 0.14, 'triangle', 0.07, 0.18);
      playTone(ctx, 1046.5, 1046.5, 0.32, 'sine', 0.08, 0.27);
      break;
  }
}
