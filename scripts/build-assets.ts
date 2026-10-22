#!/usr/bin/env node
/**
 * TENEBRIS asset pipeline — the single source of every binary in `public/assets`.
 *
 * `npm run assets` regenerates everything from scratch: models (GLB), textures
 * (KTX2/PNG), audio (WAV/OGG). Nothing in the repository is hand-authored art, so
 * a clean checkout plus this script always reproduces a playable build.
 *
 * Models are built from THREE geometry (no Blender required) and exported with
 * three's own GLTFExporter through a small Node shim (`scripts/models/glb.ts`).
 * The Blender scripts under `scripts/blender/` remain the optional path for
 * sculpted meshes once a machine with Blender is available; they write the same
 * file names, so the runtime never knows which path produced the GLB.
 *
 * Usage:
 *   npm run assets           # build all assets
 *   npm run assets -- --only=models
 *   npm run assets -- --out=dist-assets
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHero, HERO_CLIPS } from './models/hero';
import { buildMonster, MONSTER_CLIPS } from './models/monster';
import { PROP_MODELS } from './models/props';
import { exportGlb, inspectGlb } from './models/glb';
import type { CharacterAsset, PropAsset } from './models/types';
import { SOUNDS, renderSound } from './audio/sfx';
import { SAMPLE_RATE, decodeWav, encodeWav } from './audio/wav';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Every model the runtime may request. Keep in sync with `src/game/assets/manifest.ts`. */
export interface ModelEntry {
  /** Runtime id (matches `src/game/assets/manifest.ts`), not the file name. */
  readonly id: string;
  readonly name: string;
  readonly build: () => CharacterAsset | PropAsset;
  readonly clips: readonly string[];
}

const MODELS: readonly ModelEntry[] = [
  { id: 'hero', name: 'hero', build: buildHero, clips: HERO_CLIPS },
  { id: 'monsterSkeleton', name: 'monster-skeleton', build: buildMonster, clips: MONSTER_CLIPS },
  ...PROP_MODELS,
];

export interface AssetReport {
  readonly file: string;
  readonly bytes: number;
  readonly triangles: number;
  readonly clips: readonly string[];
}

export interface AudioReport {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  readonly durationSec: number;
  readonly category: string;
  readonly peak: number;
}

interface Options {
  readonly only: string[];
  readonly outDir: string;
}

function parseArgs(argv: readonly string[]): Options {
  let only: string[] = [];
  let outDir = join(ROOT, 'public', 'assets');
  for (const arg of argv) {
    if (arg.startsWith('--only=')) only = arg.slice('--only='.length).split(',').map((item) => item.trim());
    else if (arg.startsWith('--out=')) outDir = resolve(ROOT, arg.slice('--out='.length));
  }
  return { only, outDir };
}

/** Writes one GLB and returns its report line. */
async function buildModel(entry: ModelEntry, outDir: string): Promise<AssetReport> {
  const asset = entry.build();
  const isCharacter = 'clips' in asset;
  const buffer = await exportGlb(asset.group, {
    ...(isCharacter ? { animations: asset.clips } : {}),
  });

  // Fail the pipeline loudly instead of shipping a broken file: every model must
  // be a valid GLB with the clips the runtime asks for.
  const info = inspectGlb(buffer);
  if (isCharacter) {
    const exported = (info.json.animations ?? []).map((animation) => animation.name ?? '');
    const missing = entry.clips.filter((clip) => !exported.includes(clip));
    if (missing.length > 0) {
      throw new Error(`${entry.name}: clips missing from the GLB: ${missing.join(', ')}`);
    }
    if ((info.json.skins ?? []).length === 0) throw new Error(`${entry.name}: skinned export produced no skin`);
  }

  const file = join(outDir, 'models', `${entry.name}.glb`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, new Uint8Array(buffer));
  return {
    file: `models/${entry.name}.glb`,
    bytes: buffer.byteLength,
    triangles: asset.metrics.triangles,
    clips: entry.clips,
  };
}

/**
 * Renders every sound and writes it next to the models.
 *
 * The generated WAV is decoded back before it is written: a click, a clipped
 * sample or a stray DC offset would ship silently otherwise.
 */
async function buildAudio(only: readonly string[], outDir: string): Promise<AudioReport[]> {
  const selected = only.length > 0 ? SOUNDS.filter((sound) => only.includes(sound.id)) : SOUNDS;
  const reports: AudioReport[] = [];
  for (const sound of selected) {
    const samples = renderSound(sound, SAMPLE_RATE);
    const bytes = encodeWav(samples, SAMPLE_RATE);
    const { info } = decodeWav(bytes);
    if (info.channels !== 1) throw new Error(`${sound.id}: expected mono, got ${info.channels} channels`);
    if (info.sampleRate !== SAMPLE_RATE) throw new Error(`${sound.id}: wrong sample rate ${info.sampleRate}`);
    if (info.peak > 0.999) throw new Error(`${sound.id}: clips at ${info.peak.toFixed(3)}`);
    if (info.peak < 0.2) throw new Error(`${sound.id}: too quiet (${info.peak.toFixed(3)})`);
    const file = join(outDir, sound.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    reports.push({
      id: sound.id,
      file: sound.file,
      bytes: bytes.byteLength,
      durationSec: Number(info.durationSec.toFixed(3)),
      category: sound.category,
      peak: Number(info.peak.toFixed(3)),
    });
    console.log(
      `  ${sound.file.padEnd(30)} ${(bytes.byteLength / 1024).toFixed(1).padStart(6)} kB  ` +
        `${info.durationSec.toFixed(2).padStart(5)} s  ${sound.category}`,
    );
  }
  return reports;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const wantsAudio = options.only.length === 0 || options.only.includes('audio');
  const onlyModels = options.only.filter((item) => item !== 'audio');
  const selected =
    options.only.length === 0
      ? MODELS
      : MODELS.filter((model) => onlyModels.includes(model.id) || onlyModels.includes(model.name));
  if (selected.length === 0 && !wantsAudio) throw new Error(`no assets matched --only=${options.only.join(',')}`);

  const startedAt = Date.now();
  const reports: AssetReport[] = [];
  for (const entry of selected) {
    const report = await buildModel(entry, options.outDir);
    reports.push(report);
    console.log(
      `  ${report.file.padEnd(30)} ${(report.bytes / 1024).toFixed(1).padStart(6)} kB  ` +
        `${String(Math.round(report.triangles)).padStart(5)} tris  ${report.clips.join(', ')}`,
    );
  }

  const audio = wantsAudio ? await buildAudio(options.only, options.outDir) : [];

  const manifest = {
    generator: 'scripts/build-assets.ts',
    version: 2,
    sampleRate: SAMPLE_RATE,
    models: reports.map((report, index) => ({
      id: selected[index]?.id ?? report.file,
      name: report.file.replace('models/', '').replace('.glb', ''),
      file: report.file,
      bytes: report.bytes,
      clips: report.clips,
    })),
    audio,
  };
  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const modelBytes = reports.reduce((sum, report) => sum + report.bytes, 0);
  const audioBytes = audio.reduce((sum, report) => sum + report.bytes, 0);
  if (audioBytes > 600 * 1024) {
    throw new Error(`audio budget exceeded: ${(audioBytes / 1024).toFixed(1)} kB > 600 kB`);
  }
  console.log(
    `\n${reports.length} model(s) ${(modelBytes / 1024).toFixed(1)} kB + ` +
      `${audio.length} sound(s) ${(audioBytes / 1024).toFixed(1)} kB, ` +
      `${Date.now() - startedAt} ms → ${options.outDir}`,
  );
}

await main();
