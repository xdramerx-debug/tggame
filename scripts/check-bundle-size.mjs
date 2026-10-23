#!/usr/bin/env node
/**
 * Bundle budget gate.
 *
 * FREAKPIT targets phones on cellular inside a Telegram WebView, so the whole
 * app (Three.js included) has to stay under budget. The check measures gzip
 * size of the built assets, which is what actually travels over the network.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const DIST = path.resolve('dist/assets');
const TOTAL_BUDGET_KB = 420;
const CHUNK_BUDGET_KB = 170;

const files = await readdir(DIST).catch(() => []);
if (files.length === 0) {
  console.error('dist/assets is empty — run `npm run build` first.');
  process.exit(1);
}

const rows = [];
let total = 0;
let failed = false;

for (const file of files.sort()) {
  if (!/\.(js|css)$/.test(file)) continue;
  const buffer = await readFile(path.join(DIST, file));
  const gzip = gzipSync(buffer, { level: 9 }).length;
  const kb = gzip / 1024;
  total += kb;
  rows.push({ file, raw: buffer.length / 1024, gzip: kb });
  if (kb > CHUNK_BUDGET_KB) {
    console.error(`✗ ${file} is ${kb.toFixed(1)} kB gzip (limit ${CHUNK_BUDGET_KB} kB)`);
    failed = true;
  }
}

console.log('asset                                     raw kB    gzip kB');
for (const row of rows) {
  console.log(`${row.file.padEnd(40)} ${row.raw.toFixed(1).padStart(8)} ${row.gzip.toFixed(1).padStart(10)}`);
}
console.log(`${'total'.padEnd(40)} ${''.padStart(8)} ${total.toFixed(1).padStart(10)}`);

if (total > TOTAL_BUDGET_KB) {
  console.error(`✗ total ${total.toFixed(1)} kB gzip exceeds the ${TOTAL_BUDGET_KB} kB budget`);
  failed = true;
} else {
  console.log(`✓ total ${total.toFixed(1)} kB gzip, budget ${TOTAL_BUDGET_KB} kB`);
}

const index = await stat(path.resolve('dist/index.html')).catch(() => null);
if (!index) {
  console.error('✗ dist/index.html is missing');
  failed = true;
}

process.exit(failed ? 1 : 0);
