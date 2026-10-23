/**
 * Every sound in FREAKPIT is synthesised at runtime: no audio files, no
 * licensing, no download. The palettes are deliberately ugly — sheet metal,
 * wet meat, dying fluorescent tubes — because the pit is not a nice place.
 *
 * The engine is created lazily on the first user gesture (mobile browsers block
 * audio before that) and is safe to call from anywhere in the UI.
 */

export type SfxName =
  | 'ui'
  | 'select'
  | 'back'
  | 'hitLight'
  | 'hitHeavy'
  | 'block'
  | 'whiff'
  | 'jump'
  | 'land'
  | 'ko'
  | 'special'
  | 'super'
  | 'projectile'
  | 'round'
  | 'win'
  | 'lose';

interface ToneOptions {
  readonly freq: number;
  readonly endFreq?: number;
  readonly type?: OscillatorType;
  readonly duration: number;
  readonly gain?: number;
  readonly delay?: number;
  readonly detune?: number;
}

interface NoiseOptions {
  readonly duration: number;
  readonly gain?: number;
  readonly delay?: number;
  readonly filter?: number;
  readonly endFilter?: number;
  readonly q?: number;
}

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceNodes: AudioScheduledSourceNode[] = [];
  private enabled = true;

  get available(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture the first time. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.enabled ? 0.9 : 0;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 24;
      compressor.ratio.value = 8;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noiseBuffer = this.makeNoise(ctx);
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(enabled ? 0.9 : 0, now, 0.05);
    }
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    switch (name) {
      case 'ui':
        this.tone({ freq: 420, endFreq: 300, type: 'square', duration: 0.05, gain: 0.07 });
        break;
      case 'select':
        this.tone({ freq: 180, endFreq: 520, type: 'sawtooth', duration: 0.16, gain: 0.09 });
        this.tone({ freq: 90, endFreq: 60, type: 'sine', duration: 0.22, gain: 0.16 });
        break;
      case 'back':
        this.tone({ freq: 340, endFreq: 120, type: 'square', duration: 0.12, gain: 0.06 });
        break;
      case 'hitLight':
        this.noise({ duration: 0.1, gain: 0.32, filter: 2200, endFilter: 500 });
        this.tone({ freq: 190, endFreq: 70, type: 'triangle', duration: 0.1, gain: 0.28 });
        break;
      case 'hitHeavy':
        this.noise({ duration: 0.2, gain: 0.45, filter: 1400, endFilter: 180 });
        this.tone({ freq: 120, endFreq: 38, type: 'sine', duration: 0.28, gain: 0.5 });
        this.tone({ freq: 62, endFreq: 30, type: 'triangle', duration: 0.34, gain: 0.3 });
        break;
      case 'block':
        this.noise({ duration: 0.09, gain: 0.22, filter: 5200, endFilter: 2400, q: 8 });
        this.tone({ freq: 1180, endFreq: 860, type: 'square', duration: 0.08, gain: 0.09 });
        break;
      case 'whiff':
        this.noise({ duration: 0.16, gain: 0.13, filter: 900, endFilter: 2600, q: 1.4 });
        break;
      case 'jump':
        this.tone({ freq: 220, endFreq: 420, type: 'triangle', duration: 0.12, gain: 0.09 });
        break;
      case 'land':
        this.noise({ duration: 0.14, gain: 0.2, filter: 700, endFilter: 160 });
        this.tone({ freq: 84, endFreq: 44, type: 'sine', duration: 0.16, gain: 0.22 });
        break;
      case 'ko':
        this.tone({ freq: 130, endFreq: 26, type: 'sawtooth', duration: 0.9, gain: 0.4 });
        this.noise({ duration: 0.7, gain: 0.3, filter: 900, endFilter: 90 });
        break;
      case 'special':
        this.noise({ duration: 0.3, gain: 0.24, filter: 300, endFilter: 2800, q: 3 });
        this.tone({ freq: 160, endFreq: 460, type: 'sawtooth', duration: 0.24, gain: 0.14 });
        break;
      case 'super':
        this.tone({ freq: 70, endFreq: 210, type: 'sawtooth', duration: 0.7, gain: 0.3 });
        this.noise({ duration: 0.8, gain: 0.24, filter: 220, endFilter: 4200, q: 2 });
        break;
      case 'projectile':
        this.tone({ freq: 760, endFreq: 180, type: 'sawtooth', duration: 0.22, gain: 0.13 });
        this.noise({ duration: 0.2, gain: 0.1, filter: 3200, endFilter: 800 });
        break;
      case 'round':
        this.tone({ freq: 150, endFreq: 150, type: 'square', duration: 0.22, gain: 0.16 });
        this.tone({ freq: 225, endFreq: 225, type: 'square', duration: 0.22, gain: 0.1, delay: 0.05 });
        break;
      case 'win':
        [0, 0.14, 0.28].forEach((delay, index) => {
          this.tone({ freq: 220 * (1 + index * 0.5), duration: 0.26, type: 'triangle', gain: 0.14, delay });
        });
        break;
      case 'lose':
        [0, 0.18, 0.36].forEach((delay, index) => {
          this.tone({ freq: 220 / (1 + index * 0.35), duration: 0.3, type: 'sine', gain: 0.16, delay });
        });
        break;
    }
  }

  /** Low industrial drone plus occasional dripping metal. */
  startAmbience(): void {
    this.unlock();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambienceGain) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    gain.gain.setTargetAtTime(0.16, ctx.currentTime, 1.4);

    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 41;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    drone.connect(droneFilter);
    droneFilter.connect(gain);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 82.5;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.25;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(gain);

    drone.start();
    shimmer.start();
    this.ambienceGain = gain;
    this.ambienceNodes = [drone, shimmer];
  }

  stopAmbience(): void {
    const ctx = this.ctx;
    const gain = this.ambienceGain;
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    const nodes = this.ambienceNodes;
    window.setTimeout(() => {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
    }, 600);
    this.ambienceGain = null;
    this.ambienceNodes = [];
  }

  private tone(options: ToneOptions): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), start + options.duration);
    }
    if (options.detune !== undefined) osc.detune.value = options.detune;

    const gain = ctx.createGain();
    const peak = options.gain ?? 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, options.duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + options.duration + 0.02);
  }

  private noise(options: NoiseOptions): void {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.noiseBuffer;
    if (!ctx || !master || !buffer) return;

    const start = ctx.currentTime + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = options.q ?? 1;
    filter.frequency.setValueAtTime(options.filter ?? 1200, start);
    if (options.endFilter !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, options.endFilter), start + options.duration);
    }

    const gain = ctx.createGain();
    const peak = options.gain ?? 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + options.duration + 0.02);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic PRNG: the same "noise" on every device, which keeps the
    // sound design reproducible (and tests can compare renders if needed).
    let seed = 0x2f6b1d;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) % 0x100000000;
      data[i] = (seed / 0x80000000 - 1) * 0.85;
    }
    return buffer;
  }
}

export const sfx = new SfxEngine();
