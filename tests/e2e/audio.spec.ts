import { expect, test } from '@playwright/test';
import { bootIntoRun, readState } from './helpers';

/**
 * Stage-10 smoke: procedural audio is wired, served and mixed.
 *
 * Playback itself cannot be asserted headlessly (autoplay is gesture-gated and
 * the headless mixer is silent), so this suite checks the contract instead:
 * the manifest lists every cue, the files are served, and the runtime mixer
 * attaches and reports the right state.
 */
test.describe('procedural audio', () => {
  test('manifest v2 lists every cue as mono 22.05 kHz', async ({ request }) => {
    const response = await request.get('/assets/manifest.json');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      version: number;
      sampleRate: number;
      audio: { id: string; file: string; bytes: number; category: string }[];
    };
    expect(manifest.version).toBe(2);
    expect(manifest.sampleRate).toBe(22_050);
    expect(manifest.audio.length).toBe(18);
    expect(manifest.audio.map((entry) => entry.id)).toContain('ambience');
    expect(manifest.audio.every((entry) => entry.bytes > 0)).toBe(true);
  });

  test('loads every sound file without a 404 and attaches the mixer', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/assets/audio/') && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });

    await bootIntoRun(page, { seed: 5150 });
    const state = await readState(page);
    expect(state.audio?.ready).toBe(true);
    expect(state.audio?.total).toBe(18);
    expect(state.audio?.enabled).toBe(true);
    expect(failures, `audio requests failed: ${failures.join(', ')}`).toHaveLength(0);
  });
});
