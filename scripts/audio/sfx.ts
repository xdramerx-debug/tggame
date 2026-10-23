/**
 * The sound set, synthesised from scratch.
 *
 * Each entry is a pure function of (sampleRate, seed): the same repository
 * always produces byte-identical WAVs, which is what makes `npm run assets`
 * reproducible and lets tests compare generated audio against the shipped files.
 *
 * Design rules that keep the set small and readable on a phone speaker:
 * - nothing longer than ~1.2 s except the ambience loop,
 * - every impact has a low-frequency body (phones cut below ~200 Hz, so a bare
 *   click disappears outdoors),
 * - loops are edge-crossfaded, one-shots are edge-faded (no clicks).
 */
import { SAMPLE_RATE } from './wav';
import {
  buffer,
  createRng,
  envelope,
  fadeEdges,
  lowPass,
  mixInto,
  noise,
  normalize,
  reverb,
  tone,
} from './synth';

export type SoundCategory = 'sfx' | 'ui' | 'ambience';

export interface SoundDefinition {
  /** Runtime id; must match `src/game/audio/soundSet.ts`. */
  readonly id: string;
  /** Path relative to `public/assets`. */
  readonly file: string;
  readonly category: SoundCategory;
  /** Nominal length in seconds; the generator may deviate by a few samples. */
  readonly durationSec: number;
  /** Peak level after normalisation (0…1). Quiet UI clicks sit lower. */
  readonly peak: number;
  readonly build: (sampleRate: number) => Float32Array;
}

/** Crossfades the tail into the head so a loop has no seam. */
function loopify(samples: Float32Array, fadeSec: number, sampleRate: number): Float32Array {
  const fade = Math.min(Math.round(fadeSec * sampleRate), Math.floor(samples.length / 3));
  const tail = samples.length - fade;
  for (let i = 0; i < fade; i += 1) {
    const gain = i / fade;
    const head = samples[i] ?? 0;
    const end = samples[tail + i] ?? 0;
    samples[i] = head * gain + end * (1 - gain);
  }
  return samples.slice(0, tail);
}

function swing(sampleRate: number): Float32Array {
  const out = buffer(0.16, sampleRate);
  noise(out, { gain: 0.7, smoothing: 0.04, smoothingEnd: 0.8, rng: createRng(11) }, sampleRate);
  lowPass(out, 0.55);
  envelope(out, { attack: 0.008, decay: 0.16, curve: 2.4 }, sampleRate);
  return normalize(fadeEdges(out, 0.003, sampleRate), 0.75);
}

function hit(sampleRate: number): Float32Array {
  const out = buffer(0.14, sampleRate);
  tone(out, { startHz: 150, endHz: 58, gain: 0.85, durationSec: 0.13 }, sampleRate);
  noise(out, { gain: 0.45, smoothing: 0.55, rng: createRng(12), durationSec: 0.1 }, sampleRate);
  envelope(out, { attack: 0.002, decay: 0.13, curve: 2.2 }, sampleRate);
  return normalize(fadeEdges(out, 0.002, sampleRate), 0.9);
}

function crit(sampleRate: number): Float32Array {
  const out = buffer(0.22, sampleRate);
  tone(out, { startHz: 150, endHz: 60, gain: 0.8, durationSec: 0.2 }, sampleRate);
  // A detuned pair an octave and a half up reads as steel, not as a beep.
  tone(out, { startHz: 1760, endHz: 1480, gain: 0.22, detune: 9, durationSec: 0.2 }, sampleRate);
  noise(out, { gain: 0.35, smoothing: 0.3, rng: createRng(13), durationSec: 0.12 }, sampleRate);
  envelope(out, { attack: 0.002, decay: 0.21, curve: 2.6 }, sampleRate);
  reverb(out, { delaySec: 0.045, feedback: 0.28, mix: 0.18 }, sampleRate);
  return normalize(fadeEdges(out, 0.002, sampleRate), 0.92);
}

function hurt(sampleRate: number): Float32Array {
  const out = buffer(0.26, sampleRate);
  tone(out, { startHz: 210, endHz: 96, gain: 0.6, detune: 5, durationSec: 0.25 }, sampleRate);
  noise(out, { gain: 0.3, smoothing: 0.7, rng: createRng(14), durationSec: 0.2 }, sampleRate);
  envelope(out, { attack: 0.01, decay: 0.25, curve: 1.8 }, sampleRate);
  reverb(out, { delaySec: 0.06, feedback: 0.25, mix: 0.15 }, sampleRate);
  return normalize(fadeEdges(out, 0.004, sampleRate), 0.85);
}

function enemyDeath(sampleRate: number): Float32Array {
  const out = buffer(0.4, sampleRate);
  tone(out, { startHz: 190, endHz: 52, gain: 0.55, detune: 4, durationSec: 0.38 }, sampleRate);
  noise(out, { gain: 0.3, smoothing: 0.85, rng: createRng(15), durationSec: 0.36 }, sampleRate);
  // Bones: a few tiny clicks scattered through the collapse.
  const rng = createRng(16);
  for (let i = 0; i < 5; i += 1) {
    const at = 0.06 + rng() * 0.28;
    const click = buffer(0.02, sampleRate);
    noise(click, { gain: 0.5, smoothing: 0.15, rng }, sampleRate);
    envelope(click, { attack: 0.001, decay: 0.02, curve: 3 }, sampleRate);
    mixInto(out, click, at);
  }
  envelope(out, { attack: 0.004, decay: 0.4, curve: 1.5 }, sampleRate);
  reverb(out, { delaySec: 0.07, feedback: 0.32, mix: 0.2 }, sampleRate);
  return normalize(fadeEdges(out, 0.004, sampleRate), 0.85);
}

function chest(sampleRate: number): Float32Array {
  const out = buffer(0.36, sampleRate);
  // Hinge creak: low noise swelling, then a latch snap.
  noise(out, { gain: 0.4, smoothing: 0.9, smoothingEnd: 0.55, rng: createRng(17), durationSec: 0.22 }, sampleRate);
  const snap = buffer(0.06, sampleRate);
  noise(snap, { gain: 0.7, smoothing: 0.1, rng: createRng(18) }, sampleRate);
  envelope(snap, { attack: 0.001, decay: 0.05, curve: 3 }, sampleRate);
  mixInto(out, snap, 0.14);
  // Two coins: a bright fifth, short enough to read as "gold", not as a jingle.
  tone(out, { startHz: 1180, endHz: 1170, gain: 0.2, durationSec: 0.14, offsetSec: 0.2 }, sampleRate);
  tone(out, { startHz: 1760, endHz: 1740, gain: 0.16, durationSec: 0.12, offsetSec: 0.235 }, sampleRate);
  envelope(out, { attack: 0.01, decay: 0.36, curve: 1.2 }, sampleRate);
  reverb(out, { delaySec: 0.05, feedback: 0.3, mix: 0.22 }, sampleRate);
  return normalize(fadeEdges(out, 0.004, sampleRate), 0.85);
}

function door(sampleRate: number): Float32Array {
  const out = buffer(0.42, sampleRate);
  noise(out, { gain: 0.6, smoothing: 0.92, smoothingEnd: 0.6, rng: createRng(19) }, sampleRate);
  tone(out, { startHz: 70, endHz: 45, gain: 0.5, durationSec: 0.4 }, sampleRate);
  envelope(out, { attack: 0.05, decay: 0.42, curve: 1.1 }, sampleRate);
  reverb(out, { delaySec: 0.09, feedback: 0.35, mix: 0.25 }, sampleRate);
  return normalize(fadeEdges(out, 0.01, sampleRate), 0.8);
}

function campfire(sampleRate: number): Float32Array {
  const out = buffer(0.55, sampleRate);
  const rng = createRng(20);
  // Air rushing into the flame…
  noise(out, { gain: 0.35, smoothing: 0.8, smoothingEnd: 0.35, rng, durationSec: 0.32 }, sampleRate);
  // …then seven crackles, thinning out as the fire settles.
  for (let i = 0; i < 7; i += 1) {
    const at = 0.08 + rng() * 0.42;
    const pop = buffer(0.03, sampleRate);
    noise(pop, { gain: 0.55 + rng() * 0.3, smoothing: 0.2, rng }, sampleRate);
    envelope(pop, { attack: 0.001, decay: 0.03, curve: 2.5 }, sampleRate);
    mixInto(out, pop, at);
  }
  envelope(out, { attack: 0.03, decay: 0.55, curve: 1.3 }, sampleRate);
  return normalize(fadeEdges(out, 0.006, sampleRate), 0.8);
}

function ration(sampleRate: number): Float32Array {
  const out = buffer(0.18, sampleRate);
  for (const at of [0, 0.075]) {
    const crunch = buffer(0.06, sampleRate);
    noise(crunch, { gain: 0.8, smoothing: 0.35, rng: createRng(21 + at * 100), durationSec: 0.06 }, sampleRate);
    lowPass(crunch, 0.25);
    envelope(crunch, { attack: 0.002, decay: 0.06, curve: 2.2 }, sampleRate);
    mixInto(out, crunch, at);
  }
  return normalize(fadeEdges(out, 0.003, sampleRate), 0.7);
}

function step(sampleRate: number): Float32Array {
  const out = buffer(0.07, sampleRate);
  noise(out, { gain: 0.55, smoothing: 0.65, rng: createRng(23) }, sampleRate);
  tone(out, { startHz: 95, endHz: 60, gain: 0.35, durationSec: 0.06 }, sampleRate);
  envelope(out, { attack: 0.002, decay: 0.07, curve: 2.8 }, sampleRate);
  return normalize(fadeEdges(out, 0.002, sampleRate), 0.45);
}

function hunger(sampleRate: number): Float32Array {
  const out = buffer(0.4, sampleRate);
  // Two stomach growls: low, rounded, slightly rising — reads as a warning.
  tone(out, { startHz: 78, endHz: 62, gain: 0.8, detune: 3, durationSec: 0.15 }, sampleRate);
  tone(out, { startHz: 70, endHz: 55, gain: 0.7, detune: 3, durationSec: 0.16, offsetSec: 0.2 }, sampleRate);
  noise(out, { gain: 0.12, smoothing: 0.9, rng: createRng(24) }, sampleRate);
  envelope(out, { attack: 0.02, decay: 0.38, curve: 1.4 }, sampleRate);
  return normalize(fadeEdges(out, 0.008, sampleRate), 0.7);
}

function descend(sampleRate: number): Float32Array {
  const out = buffer(0.65, sampleRate);
  noise(out, { gain: 0.5, smoothing: 0.25, smoothingEnd: 0.92, rng: createRng(25) }, sampleRate);
  tone(out, { startHz: 320, endHz: 70, gain: 0.4, detune: 6, durationSec: 0.6 }, sampleRate);
  envelope(out, { attack: 0.02, decay: 0.64, curve: 1.4 }, sampleRate);
  reverb(out, { delaySec: 0.11, feedback: 0.4, mix: 0.3 }, sampleRate);
  return normalize(fadeEdges(out, 0.01, sampleRate), 0.85);
}

function bossRoar(sampleRate: number): Float32Array {
  const out = buffer(0.95, sampleRate);
  tone(out, { startHz: 88, endHz: 52, gain: 0.7, detune: 7, durationSec: 0.9 }, sampleRate);
  tone(out, { startHz: 176, endHz: 104, gain: 0.25, detune: 11, durationSec: 0.85 }, sampleRate);
  noise(out, { gain: 0.4, smoothing: 0.7, smoothingEnd: 0.85, rng: createRng(26), durationSec: 0.9 }, sampleRate);
  envelope(out, { attack: 0.12, decay: 0.9, curve: 1.2 }, sampleRate);
  reverb(out, { delaySec: 0.12, feedback: 0.45, mix: 0.3 }, sampleRate);
  return normalize(fadeEdges(out, 0.02, sampleRate), 0.92);
}

function bossPhase(sampleRate: number): Float32Array {
  const out = buffer(0.65, sampleRate);
  // Rising shriek: the audio mirror of the health bar turning red.
  tone(out, { startHz: 300, endHz: 980, gain: 0.45, detune: 10, durationSec: 0.55, offsetSec: 0.05 }, sampleRate);
  noise(out, { gain: 0.35, smoothing: 0.3, smoothingEnd: 0.1, rng: createRng(27), durationSec: 0.5, offsetSec: 0.08 }, sampleRate);
  envelope(out, { attack: 0.06, decay: 0.64, curve: 1.6 }, sampleRate);
  reverb(out, { delaySec: 0.08, feedback: 0.4, mix: 0.28 }, sampleRate);
  return normalize(fadeEdges(out, 0.01, sampleRate), 0.9);
}

function victory(sampleRate: number): Float32Array {
  const out = buffer(1.2, sampleRate);
  // A minor-to-major resolution: A3, C4, E4, A4 — the run is over, not happy.
  const chord = [220, 261.6, 329.6, 440];
  chord.forEach((hz, index) => {
    tone(out, { startHz: hz, gain: 0.22, durationSec: 1.1, offsetSec: index * 0.09 }, sampleRate);
    tone(out, { startHz: hz * 2, gain: 0.06, durationSec: 0.9, offsetSec: index * 0.09 }, sampleRate);
  });
  envelope(out, { attack: 0.02, decay: 1.18, curve: 1.3 }, sampleRate);
  reverb(out, { delaySec: 0.13, feedback: 0.45, mix: 0.3 }, sampleRate);
  return normalize(fadeEdges(out, 0.01, sampleRate), 0.85);
}

function death(sampleRate: number): Float32Array {
  const out = buffer(1.3, sampleRate);
  tone(out, { startHz: 220, endHz: 48, gain: 0.6, detune: 5, durationSec: 1.25 }, sampleRate);
  noise(out, { gain: 0.25, smoothing: 0.9, rng: createRng(28), durationSec: 1.2 }, sampleRate);
  envelope(out, { attack: 0.03, decay: 1.28, curve: 1.4 }, sampleRate);
  reverb(out, { delaySec: 0.15, feedback: 0.5, mix: 0.32 }, sampleRate);
  return normalize(fadeEdges(out, 0.02, sampleRate), 0.85);
}

function ui(sampleRate: number): Float32Array {
  const out = buffer(0.05, sampleRate);
  tone(out, { startHz: 1250, endHz: 900, gain: 0.5, durationSec: 0.04 }, sampleRate);
  noise(out, { gain: 0.25, smoothing: 0.2, rng: createRng(29), durationSec: 0.02 }, sampleRate);
  envelope(out, { attack: 0.001, decay: 0.05, curve: 3 }, sampleRate);
  return normalize(fadeEdges(out, 0.001, sampleRate), 0.4);
}

function levelUp(sampleRate: number): Float32Array {
  const out = buffer(0.62, sampleRate);
  // A rising minor third, then the octave: readable as "stronger now" without
  // turning into a victory jingle (the run is not over).
  tone(out, { startHz: 330, gain: 0.32, durationSec: 0.14 }, sampleRate);
  tone(out, { startHz: 392, gain: 0.3, durationSec: 0.14, offsetSec: 0.1 }, sampleRate);
  tone(out, { startHz: 495, gain: 0.28, durationSec: 0.18, offsetSec: 0.2 }, sampleRate);
  tone(out, { startHz: 660, gain: 0.24, durationSec: 0.34, offsetSec: 0.32 }, sampleRate);
  // A whispered shimmer on top: the sound of the stat bump landing.
  noise(out, { gain: 0.1, smoothing: 0.4, smoothingEnd: 0.85, rng: createRng(28), durationSec: 0.5, offsetSec: 0.2 }, sampleRate);
  envelope(out, { attack: 0.01, decay: 0.62, curve: 1.3 }, sampleRate);
  reverb(out, { delaySec: 0.05, feedback: 0.3, mix: 0.2 }, sampleRate);
  return normalize(fadeEdges(out, 0.006, sampleRate), 0.8);
}

function ambience(sampleRate: number): Float32Array {
  const out = buffer(3.5, sampleRate);
  const rng = createRng(30);
  // Drone: a fifth with slow beating, so the loop never sounds static.
  tone(out, { startHz: 55, gain: 0.28 }, sampleRate);
  tone(out, { startHz: 82.5, gain: 0.16 }, sampleRate);
  tone(out, { startHz: 110, gain: 0.06, detune: 0.7 }, sampleRate);
  // Air and distant grit.
  noise(out, { gain: 0.14, smoothing: 0.96, rng }, sampleRate);
  // Water drips at irregular intervals: the only "events" in the loop.
  for (let i = 0; i < 5; i += 1) {
    const at = 0.2 + rng() * 3.1;
    const drip = buffer(0.09, sampleRate);
    tone(drip, { startHz: 1400 + rng() * 700, endHz: 700, gain: 0.35, durationSec: 0.08 }, sampleRate);
    envelope(drip, { attack: 0.002, decay: 0.09, curve: 2.6 }, sampleRate);
    reverb(drip, { delaySec: 0.06, feedback: 0.4, mix: 0.35 }, sampleRate);
    mixInto(out, drip, at);
  }
  lowPass(out, 0.45);
  const looped = loopify(out, 0.3, sampleRate);
  return normalize(looped, 0.5);
}

/** Every generated sound, in build order. */
export const SOUNDS: readonly SoundDefinition[] = [
  { id: 'ui', file: 'audio/ui.wav', category: 'ui', durationSec: 0.05, peak: 0.4, build: ui },
  { id: 'swing', file: 'audio/swing.wav', category: 'sfx', durationSec: 0.16, peak: 0.75, build: swing },
  { id: 'hit', file: 'audio/hit.wav', category: 'sfx', durationSec: 0.14, peak: 0.9, build: hit },
  { id: 'crit', file: 'audio/crit.wav', category: 'sfx', durationSec: 0.22, peak: 0.92, build: crit },
  { id: 'hurt', file: 'audio/hurt.wav', category: 'sfx', durationSec: 0.26, peak: 0.85, build: hurt },
  { id: 'enemy-death', file: 'audio/enemy-death.wav', category: 'sfx', durationSec: 0.4, peak: 0.85, build: enemyDeath },
  { id: 'chest', file: 'audio/chest.wav', category: 'sfx', durationSec: 0.36, peak: 0.85, build: chest },
  { id: 'door', file: 'audio/door.wav', category: 'sfx', durationSec: 0.42, peak: 0.8, build: door },
  { id: 'campfire', file: 'audio/campfire.wav', category: 'sfx', durationSec: 0.55, peak: 0.8, build: campfire },
  { id: 'ration', file: 'audio/ration.wav', category: 'sfx', durationSec: 0.18, peak: 0.7, build: ration },
  { id: 'step', file: 'audio/step.wav', category: 'sfx', durationSec: 0.07, peak: 0.45, build: step },
  { id: 'hunger', file: 'audio/hunger.wav', category: 'sfx', durationSec: 0.4, peak: 0.7, build: hunger },
  { id: 'descend', file: 'audio/descend.wav', category: 'sfx', durationSec: 0.65, peak: 0.85, build: descend },
  { id: 'boss-roar', file: 'audio/boss-roar.wav', category: 'sfx', durationSec: 0.95, peak: 0.92, build: bossRoar },
  { id: 'boss-phase', file: 'audio/boss-phase.wav', category: 'sfx', durationSec: 0.65, peak: 0.9, build: bossPhase },
  { id: 'victory', file: 'audio/victory.wav', category: 'sfx', durationSec: 1.2, peak: 0.85, build: victory },
  { id: 'death', file: 'audio/death.wav', category: 'sfx', durationSec: 1.3, peak: 0.85, build: death },
  { id: 'level-up', file: 'audio/level-up.wav', category: 'sfx', durationSec: 0.62, peak: 0.8, build: levelUp },
  { id: 'ambience', file: 'audio/ambience.wav', category: 'ambience', durationSec: 3.2, peak: 0.5, build: ambience },
];

/** Builds one sound at an explicit sample rate (the pipeline always uses 22.05 kHz). */
export function renderSound(definition: SoundDefinition, sampleRate: number = SAMPLE_RATE): Float32Array {
  const samples = definition.build(sampleRate);
  if (definition.category === 'ambience') return samples;
  return normalize(samples, definition.peak);
}

/** Total raw PCM size of the set, used by the size guard in tests. */
export function totalAudioBytes(): number {
  return SOUNDS.reduce((sum, sound) => sum + Math.round(sound.durationSec * SAMPLE_RATE) * 2, 0);
}
