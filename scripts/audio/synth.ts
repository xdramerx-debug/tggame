/**
 * Tiny deterministic synthesis kit for the sound set.
 *
 * Everything here is plain arithmetic on Float32 buffers: no AudioContext, no
 * native codecs, no samples from the internet. That keeps `npm run assets`
 * reproducible on any machine and makes the whole sound design unit-testable.
 */
import { SAMPLE_RATE } from './wav';

/** Mulberry32: small, fast and identical on every platform. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function buffer(durationSec: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.max(1, Math.round(durationSec * sampleRate)));
}

export interface EnvelopeSpec {
  /** Seconds to reach 1. */
  readonly attack?: number;
  /** Total seconds until silence; defaults to the buffer length. */
  readonly decay?: number;
  /** 1 = linear, 2 = quadratic, 0.5 = fast start. */
  readonly curve?: number;
}

/** Attack/decay envelope written in place; returns the same buffer. */
export function envelope(samples: Float32Array, spec: EnvelopeSpec = {}, sampleRate: number = SAMPLE_RATE): Float32Array {
  const attack = Math.max(1, Math.round((spec.attack ?? 0.005) * sampleRate));
  const decay = Math.round((spec.decay ?? samples.length / sampleRate) * sampleRate);
  const curve = spec.curve ?? 1.6;
  for (let i = 0; i < samples.length; i += 1) {
    const attackGain = i < attack ? i / attack : 1;
    const decayProgress = i < decay ? Math.min(1, i / Math.max(1, decay)) : 1;
    const decayGain = Math.pow(1 - decayProgress, curve);
    samples[i] = (samples[i] ?? 0) * attackGain * decayGain;
  }
  return samples;
}

/** Adds a sine (or detuned stack) with a linear pitch sweep, in place. */
export function tone(
  samples: Float32Array,
  options: {
    readonly startHz: number;
    readonly endHz?: number;
    readonly gain?: number;
    readonly detune?: number;
    readonly offsetSec?: number;
    readonly durationSec?: number;
  },
  sampleRate: number = SAMPLE_RATE,
): Float32Array {
  const start = Math.round((options.offsetSec ?? 0) * sampleRate);
  const length = Math.min(
    samples.length - start,
    Math.round((options.durationSec ?? samples.length / sampleRate) * sampleRate),
  );
  const gain = options.gain ?? 0.5;
  const endHz = options.endHz ?? options.startHz;
  // A detuned stack turns a bare sine into something with body (bells, roars).
  const detunes = options.detune ? [0, options.detune, -options.detune] : [0];
  const phases = detunes.map(() => 0);
  for (let i = 0; i < length; i += 1) {
    const progress = length <= 1 ? 0 : i / (length - 1);
    const hz = options.startHz + (endHz - options.startHz) * progress;
    let value = 0;
    for (let o = 0; o < detunes.length; o += 1) {
      const voiceHz = Math.max(1, hz + (detunes[o] ?? 0));
      phases[o] = (phases[o] ?? 0) + (voiceHz * Math.PI * 2) / sampleRate;
      value += Math.sin(phases[o] ?? 0) / detunes.length;
    }
    const index = start + i;
    samples[index] = (samples[index] ?? 0) + value * gain;
  }
  return samples;
}

/** Adds band-limited noise (a one-pole pair), the basis of impacts and whooshes. */
export function noise(
  samples: Float32Array,
  options: {
    readonly gain?: number;
    readonly rng?: () => number;
    readonly offsetSec?: number;
    readonly durationSec?: number;
    /** 0 = white, 1 = heavy low-pass. */
    readonly smoothing?: number;
    /** Sweep of the smoothing amount over the burst (whooshes). */
    readonly smoothingEnd?: number;
  },
  sampleRate: number = SAMPLE_RATE,
): Float32Array {
  const start = Math.round((options.offsetSec ?? 0) * sampleRate);
  const length = Math.min(
    samples.length - start,
    Math.round((options.durationSec ?? samples.length / sampleRate) * sampleRate),
  );
  const rng = options.rng ?? createRng(0x9e3779b9);
  const gain = options.gain ?? 0.5;
  const from = Math.max(0, Math.min(0.995, options.smoothing ?? 0.2));
  const to = Math.max(0, Math.min(0.995, options.smoothingEnd ?? from));
  let low = 0;
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const progress = length <= 1 ? 0 : i / (length - 1);
    const smoothing = from + (to - from) * progress;
    const white = rng() * 2 - 1;
    low = low * smoothing + white * (1 - smoothing);
    // A single pole leaves rumble; mixing the high-passed remainder restores bite.
    const value = low * 0.75 + (white - previous) * 0.25;
    previous = white;
    const index = start + i;
    samples[index] = (samples[index] ?? 0) + value * gain;
  }
  return samples;
}

/** One-pole low-pass, in place. */
export function lowPass(samples: Float32Array, coefficient: number): Float32Array {
  const k = Math.max(0, Math.min(0.999, coefficient));
  let state = 0;
  for (let i = 0; i < samples.length; i += 1) {
    state = state * k + (samples[i] ?? 0) * (1 - k);
    samples[i] = state;
  }
  return samples;
}

/** Feedback comb used as a cheap "stone hall" tail. */
export function reverb(samples: Float32Array, options: { delaySec?: number; feedback?: number; mix?: number } = {}, sampleRate: number = SAMPLE_RATE): Float32Array {
  const delay = Math.max(1, Math.round((options.delaySec ?? 0.075) * sampleRate));
  const feedback = Math.max(0, Math.min(0.9, options.feedback ?? 0.35));
  const mix = Math.max(0, Math.min(1, options.mix ?? 0.25));
  for (let i = delay; i < samples.length; i += 1) {
    const wet = (samples[i - delay] ?? 0) * feedback;
    samples[i] = (samples[i] ?? 0) * (1 - mix) + wet * mix;
  }
  return samples;
}

/** Scales the buffer so its absolute peak equals `peak`. */
export function normalize(samples: Float32Array, peak = 0.9): Float32Array {
  let current = 0;
  for (const sample of samples) current = Math.max(current, Math.abs(sample));
  if (current < 1e-6) return samples;
  const scale = peak / current;
  for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] ?? 0) * scale;
  return samples;
}

/** Short fades on both edges: a hard start is an audible click on a phone. */
export function fadeEdges(samples: Float32Array, fadeSec = 0.004, sampleRate: number = SAMPLE_RATE): Float32Array {
  const fade = Math.max(1, Math.round(fadeSec * sampleRate));
  const limit = Math.min(fade, Math.floor(samples.length / 2));
  for (let i = 0; i < limit; i += 1) {
    const gain = i / limit;
    const head = samples[i] ?? 0;
    const tailIndex = samples.length - 1 - i;
    const tail = samples[tailIndex] ?? 0;
    samples[i] = head * gain;
    samples[tailIndex] = tail * gain;
  }
  return samples;
}

/** Mixes `source` into `target` at an offset (seconds). */
export function mixInto(target: Float32Array, source: Float32Array, offsetSec = 0): Float32Array {
  const offset = Math.round(offsetSec * SAMPLE_RATE);
  for (let i = 0; i < source.length; i += 1) {
    const index = offset + i;
    if (index >= target.length) break;
    target[index] = (target[index] ?? 0) + (source[i] ?? 0);
  }
  return target;
}
