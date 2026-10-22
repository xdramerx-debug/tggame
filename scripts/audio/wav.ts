/**
 * Minimal PCM WAV writer — the only binary format the audio pipeline emits.
 *
 * 16-bit mono PCM at 22.05 kHz is deliberately small: 44.1 kB per second, which
 * keeps the whole sound set inside the bundle budget and decodes natively on
 * every WebView (no codec, no WASM). Encoders (`ogg`) are optional and only used
 * when the environment provides one; WAV is the reproducible baseline.
 */

/** Sample rate of every generated file (matches `src/game/audio/AudioManager.ts`). */
export const SAMPLE_RATE = 22_050;

/** Bytes of a canonical 44-byte PCM WAV header. */
export const WAV_HEADER_BYTES = 44;

export interface WavInfo {
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly dataBytes: number;
  readonly frames: number;
  readonly durationSec: number;
  /** Absolute peak of the decoded signal (0…1). */
  readonly peak: number;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/**
 * Encodes float samples (−1…1) as a 44-byte-header PCM WAV.
 * Out-of-range values are clamped, NaN becomes silence.
 */
export function encodeWav(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = samples.length * blockAlign;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = clampSample(samples[i] ?? 0);
    // Asymmetric scaling: −1…1 maps onto −32768…32767 without wrapping.
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(sample * 32_767), true);
  }
  return new Uint8Array(buffer);
}

/** Decodes the data chunk of a generated WAV back to floats (tests/QA). */
export function decodeWav(bytes: Uint8Array): { info: WavInfo; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number): string => {
    let text = '';
    for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
    return text;
  };
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  if (ascii(12, 4) !== 'fmt ') throw new Error('missing fmt chunk');

  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  const frames = dataBytes / (channels * (bitsPerSample / 8));
  const samples = new Float32Array(frames);
  let peak = 0;
  for (let i = 0; i < frames; i += 1) {
    const value = view.getInt16(WAV_HEADER_BYTES + i * 2, true) / 32_768;
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  return {
    info: {
      channels,
      sampleRate,
      bitsPerSample,
      dataBytes,
      frames,
      durationSec: frames / sampleRate,
      peak,
    },
    samples,
  };
}
