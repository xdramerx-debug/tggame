#!/usr/bin/env node
/**
 * Build-output guard.
 *
 * Exists because of a real outage: GitHub Pages served the *source* index.html
 * from the branch root, which loads `/src/main.tsx` — a file that only exists in
 * development. The page rendered its splash and then nothing, forever.
 *
 * This check makes that class of bug impossible to ship: `dist/index.html` must
 * reference the hashed bundle, must not reference `/src/`, and every asset it
 * points at must exist on disk (case-sensitively, since Pages is Linux).
 */
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const failures = [];

function fail(message) {
  failures.push(message);
}

const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => null);
if (html === null) {
  console.error('✖ dist/index.html is missing — run `npm run build` first');
  process.exit(1);
}

// 1. A built entry point, not the dev one.
if (/(src|href)="\.?\/?src\//.test(html)) {
  fail('index.html still references /src/ — this is the source file, not a build');
}
if (!/src="\.\/assets\/[^"]+\.js"/.test(html)) {
  fail('index.html has no hashed module entry (./assets/*.js)');
}

// 2. Every local asset referenced by the page must exist next to it.
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value && !/^(https?:|data:|#|\/\/)/.test(value));

for (const reference of references) {
  const path = join(DIST, reference.replace(/^\.\//, '').split('?')[0]);
  try {
    await access(path);
  } catch {
    fail(`referenced file is missing from the build: ${reference}`);
  }
}

// 3. The manifest and the icons it lists must ship together.
const manifestPath = join(DIST, 'manifest.webmanifest');
const manifestRaw = await readFile(manifestPath, 'utf8').catch(() => null);
if (manifestRaw === null) {
  fail('manifest.webmanifest is missing');
} else {
  const manifest = JSON.parse(manifestRaw);
  for (const icon of manifest.icons ?? []) {
    try {
      await access(join(DIST, icon.src));
    } catch {
      fail(`manifest icon is missing from the build: ${icon.src}`);
    }
  }
  if (manifest.orientation !== 'landscape' || manifest.display !== 'fullscreen') {
    fail('manifest must stay landscape + fullscreen (the game cannot work otherwise)');
  }
}

// 4. No stray copy of the source tree in the artifact.
for (const forbidden of ['src', 'node_modules', 'tests', 'scripts']) {
  try {
    await access(join(DIST, forbidden));
    fail(`dist must not contain ${forbidden}/`);
  } catch {
    // Expected: the build is flat.
  }
}

if (failures.length > 0) {
  console.error('✖ build output is not deployable:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`✔ dist is deployable (${references.length} local references verified)`);
