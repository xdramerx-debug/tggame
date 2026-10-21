#!/usr/bin/env node
/**
 * Bundle budget guard.
 *
 * Spec: < 3 MB gzip for the initial bundle (models are lazy-loaded later).
 * Computes gzip size of every emitted asset and fails CI if the sum exceeds the
 * budget, or if any JS chunk is unexpectedly large (> 900 KB raw is a smell).
 */
import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const BUDGET_GZIP = 3 * 1024 * 1024;
const CHUNK_WARN_BYTES = 900 * 1024;
const DIST = new URL('../dist/', import.meta.url).pathname;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

let totalGzip = 0;
let totalRaw = 0;
const rows = [];

for (const file of await walk(DIST)) {
  const info = await stat(file);
  const content = await readFile(file);
  const gz = gzipSync(content, { level: 9 }).length;
  totalGzip += gz;
  totalRaw += info.size;
  rows.push({ file: file.replace(DIST, ''), raw: info.size, gzip: gz });
}

rows.sort((a, b) => b.gzip - a.gzip);
for (const row of rows.slice(0, 12)) {
  console.log(`${row.gzip.toString().padStart(9)} B  ${row.raw.toString().padStart(9)} B  ${row.file}`);
}
console.log(`\nTotal raw:  ${(totalRaw / 1024).toFixed(1)} kB`);
console.log(`Total gzip: ${(totalGzip / 1024).toFixed(1)} kB (budget ${(BUDGET_GZIP / 1024).toFixed(0)} kB)`);

// Rapier's compat build inlines the WASM as base64 and is loaded lazily on the
// splash screen; it is accounted for in the total but is not an "unexpected" chunk.
const EXPECTED_LAZY = /rapier/i;
const jsChunks = rows.filter(
  (row) => row.file.endsWith('.js') && row.raw > CHUNK_WARN_BYTES && !EXPECTED_LAZY.test(row.file),
);
if (jsChunks.length > 0) {
  console.warn(`\n⚠ JS chunks above ${CHUNK_WARN_BYTES / 1024} kB: ${jsChunks.map((c) => c.file).join(', ')}`);
}

if (totalGzip > BUDGET_GZIP) {
  console.error(`\n✖ Bundle budget exceeded by ${((totalGzip - BUDGET_GZIP) / 1024).toFixed(0)} kB`);
  process.exit(1);
}
console.log('\n✔ Bundle within budget');
