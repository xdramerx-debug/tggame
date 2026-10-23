import { describe, expect, it, vi } from 'vitest';
import {
  createRateState, DEV_CONFIG, PROD_CONFIG, PROMO_CODES, validateCode, type ValidateOptions,
} from '../../src/game/codes';

const NOW = Date.now();

function opts(over: Partial<ValidateOptions> = {}) {
  return {
    config: DEV_CONFIG,
    account: { id: 42, devMode: true },
    rate: createRateState(),
    now: NOW,
    usedCodes: [] as string[],
    onLog: vi.fn(),
    ...over,
  };
}

describe('admin & promo codes (§15)', () => {
  it('promo code works for everyone, is case-insensitive and trimmed', () => {
    const o = opts();
    const { result } = validateCode('  welcome2025 ', o);
    expect(result.ok).toBe(true);
    if (result.ok && result.effect.kind === 'reward') {
      expect(result.effect.reward.crystals).toBe(100);
      expect(result.effect.reward.scrolls).toBe(5);
    }
  });

  it('promo code cannot be used twice by one account', () => {
    const o = opts();
    const first = validateCode('WELCOME2025', o);
    expect(first.result.ok).toBe(true);
    const second = validateCode('WELCOME2025', { ...o, rate: first.rate, usedCodes: ['WELCOME2025'] });
    expect(second.result.ok).toBe(false);
    if (!second.result.ok) expect(second.result.reason).toBe('Код недействителен');
  });

  it('admin codes are rejected in production for non-whitelisted accounts — with the same vague message', () => {
    const o = opts({ config: PROD_CONFIG, account: { id: 999, devMode: false } });
    const { result } = validateCode('admin_gold_1000000', o);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Код недействителен');
  });

  it('admin codes work for whitelisted accounts in production', () => {
    const config = { ...PROD_CONFIG, adminWhitelist: [111111111] };
    const o = opts({ config, account: { id: 111111111, devMode: false } });
    const { result } = validateCode('ADMIN_GEMS_10000', o);
    expect(result.ok).toBe(true);
    if (result.ok && result.effect.kind === 'admin') expect(result.effect.action).toBe('gems');
  });

  it('dev commands only work in dev mode', () => {
    const prod = validateCode('dev_fps', opts({ config: PROD_CONFIG, account: { id: 1, devMode: false } }));
    expect(prod.result.ok).toBe(false);
    const dev = validateCode('dev_fps', opts());
    expect(dev.result.ok).toBe(true);
    if (dev.result.ok && dev.result.effect.kind === 'dev') expect(dev.result.effect.command).toBe('fps');
  });

  it('dev_fast_forward parses its numeric argument', () => {
    const { result } = validateCode('dev_fast_forward_3600', opts());
    expect(result.ok).toBe(true);
    if (result.ok && result.effect.kind === 'dev') {
      expect(result.effect.command).toBe('fast_forward');
      expect(result.effect.arg).toBe(3600);
    }
  });

  it('admin_reset_save requires double confirmation within 30 seconds', () => {
    const o = opts();
    const first = validateCode('admin_reset_save', o);
    expect(first.result.ok).toBe(true);
    expect(first.rate.pendingResetAt).toBe(NOW);

    const tooLate = validateCode('admin_reset_save', { ...o, rate: first.rate, now: NOW + 31_000 });
    expect(tooLate.rate.pendingResetAt).not.toBe(null); // starts a NEW confirmation instead

    const confirmed = validateCode('admin_reset_save', { ...o, rate: first.rate, now: NOW + 10_000 });
    expect(confirmed.result.ok).toBe(true);
    expect(confirmed.rate.pendingResetAt).toBe(null);
    if (confirmed.result.ok && confirmed.result.effect.kind === 'resetSave') {
      expect(confirmed.result.effect.needsSecondConfirm).toBe(true);
    }
  });

  it('rate limit: 5 attempts per minute, then a 10-minute block', () => {
    let rate = createRateState();
    for (let i = 0; i < 5; i++) {
      const r = validateCode('GOLD999', { ...opts(), rate, now: NOW + i * 1000 });
      rate = r.rate;
      expect(r.result.ok).toBe(false);
    }
    const blocked = validateCode('WELCOME2025', { ...opts(), rate, now: NOW + 10_000 });
    expect(blocked.result.ok).toBe(false);
    if (!blocked.result.ok) expect(blocked.result.reason).toContain('заблокирован');
    // after the block window the valid promo works again
    const later = validateCode('WELCOME2025', { ...opts(), rate: blocked.rate, now: NOW + 11 * 60_000 });
    expect(later.result.ok).toBe(true);
  });

  it('same admin code is limited to 5 uses per hour per account', () => {
    let rate = createRateState();
    for (let i = 0; i < 5; i++) {
      const r = validateCode('admin_souls_200', { ...opts(), rate, now: NOW + i * 1000 });
      rate = r.rate;
      expect(r.result.ok).toBe(true);
    }
    const sixth = validateCode('admin_souls_200', { ...opts(), rate, now: NOW + 10_000 });
    expect(sixth.result.ok).toBe(false);
    const afterHour = validateCode('admin_souls_200', { ...opts(), rate, now: NOW + 3_610_000 });
    expect(afterHour.result.ok).toBe(true);
  });

  it('every attempt is logged for the admin journal', () => {
    const onLog = vi.fn();
    validateCode('welcome2025', opts({ onLog }));
    validateCode('nope-nope', opts({ onLog }));
    expect(onLog).toHaveBeenCalledTimes(2);
    expect(onLog.mock.calls[0]?.[0]).toMatchObject({ code: 'WELCOME2025', ok: true });
    expect(onLog.mock.calls[1]?.[0]).toMatchObject({ ok: false });
  });

  it('promo codes are ≥8 chars and have expiry + global limits', () => {
    for (const p of PROMO_CODES) {
      expect(p.code.length).toBeGreaterThanOrEqual(8);
      expect(p.expiresAt).toBeGreaterThan(NOW - 1);
      expect(p.maxUses).toBeGreaterThan(0);
    }
  });

  it('unknown codes never leak hints', () => {
    const { result } = validateCode('GOLD999FREE', opts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Код недействителен');
  });
});
