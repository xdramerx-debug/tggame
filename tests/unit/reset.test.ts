import { describe, expect, it } from 'vitest';
import { resetRequested } from '@/debug/reset';

/**
 * The reset flag is the only destructive switch the game exposes, so it is read
 * strictly: `?reset=1` and nothing else. `?reset=0`, `?reset=yes` and a stray
 * `?reset` must all be inert.
 */
describe('reset flag', () => {
  it('only accepts an explicit 1', () => {
    expect(resetRequested('?reset=1')).toBe(true);
    expect(resetRequested('?quality=low&reset=1&seed=42')).toBe(true);
    expect(resetRequested('?reset=0')).toBe(false);
    expect(resetRequested('?reset')).toBe(false);
    expect(resetRequested('?reset=true')).toBe(false);
    expect(resetRequested('')).toBe(false);
  });
});
