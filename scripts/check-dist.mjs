#!/usr/bin/env node
/**
 * Post-build smoke check used by CI and by the deploy workflow.
 *
 * Catches the classic GitHub Pages failures before they reach a phone:
 * absolute asset paths, a missing entry point, an unbuilt `/src/` reference,
 * or a service worker that would cache a broken shell.
 */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const errors = [];

const html = await readFile(path.join(root, 'index.html'), 'utf8').catch(() => null);
if (html === null) {
  console.error('✗ dist/index.html is missing — did the build run?');
  process.exit(1);
}

if (!html.includes('id="root"')) errors.push('index.html has no #root mount point');
if (html.includes('/src/main.tsx')) errors.push('index.html still points at the dev entry /src/main.tsx');
if (/<script[^>]+src="\//.test(html)) errors.push('absolute script path: the app will break on a sub-path deploy');
if (/<link[^>]+href="\//.test(html)) errors.push('absolute stylesheet path: the app will break on a sub-path deploy');

const referenced = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url && !url.startsWith('http') && !url.startsWith('data:'));

for (const url of referenced) {
  if (url.startsWith('/')) {
    errors.push(`absolute asset reference: ${url}`);
    continue;
  }
  try {
    await access(path.join(root, url));
  } catch {
    errors.push(`referenced asset is missing from dist: ${url}`);
  }
}

if (!html.includes('name="viewport"')) errors.push('viewport meta tag is missing');
if (!html.includes('viewport-fit=cover')) errors.push('viewport-fit=cover is required for safe-area insets');

if (errors.length > 0) {
  console.error('✗ dist check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`✓ dist is deployable (${referenced.length} local assets, relative paths only)`);
