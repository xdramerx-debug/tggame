import { createRng } from './rng';
import type { RewardBundle } from './types';

/**
 * Admin/promo codes (§15). The CLIENT NEVER decides whether a code works:
 * this module emulates the server side (whitelist, expiry, usage limits,
 * rate limit, logging). In production `allowAdminCodes` is false for everyone
 * outside the server-side whitelist; in dev mode it is true.
 */

export interface CodeServerConfig {
  allowAdminCodes: boolean;
  /** internal Telegram IDs allowed to use admin codes — lives "on the server" */
  adminWhitelist: number[];
}

export const PROD_CONFIG: CodeServerConfig = { allowAdminCodes: false, adminWhitelist: [111111111, 222222222] };
export const DEV_CONFIG: CodeServerConfig = { allowAdminCodes: true, adminWhitelist: [] };

export interface PromoCodeDef {
  code: string;
  expiresAt: number; // ms epoch
  maxUses: number;
  reward: RewardBundle;
  label: string;
}

const DAY = 24 * 3600 * 1000;
const NOW = Date.now();

export const PROMO_CODES: PromoCodeDef[] = [
  { code: 'WELCOME2025', expiresAt: NOW + 30 * DAY, maxUses: 10_000, reward: { crystals: 100, scrolls: 5 }, label: '100 💎 + 5 свитков призыва' },
  { code: 'NEWYEAR2026', expiresAt: NOW + 14 * DAY, maxUses: 5_000, reward: { shards: 60 }, label: '60 шардов случайного легендарного героя' },
  { code: 'STREAMSTART', expiresAt: NOW + 7 * DAY, maxUses: 2_000, reward: { gold: 250_000, heroExp: 120_000 }, label: 'Золото и опыт на 3 уровня' },
];

export type CodeEffect =
  | { kind: 'reward'; reward: RewardBundle; label: string }
  | { kind: 'admin'; action: AdminAction; label: string }
  | { kind: 'dev'; command: string; arg?: number }
  | { kind: 'resetSave'; needsSecondConfirm: true };

export type AdminAction =
  | 'gold' | 'gems' | 'exp' | 'shards' | 'summons' | 'souls'
  | 'heroAll' | 'heroMax' | 'starMax' | 'unlockAll' | 'skipTutorial'
  | 'setStage50' | 'offline12h' | 'forceWin' | 'forceLose' | 'log' | 'resetSave';

const ADMIN_CODES: Record<string, { action: AdminAction; label: string; reward?: RewardBundle; arg?: number }> = {
  admin_gold_1000000: { action: 'gold', label: '+1 000 000 золота', reward: { gold: 1_000_000 } },
  admin_gems_10000: { action: 'gems', label: '+10 000 кристаллов', reward: { crystals: 10_000 } },
  admin_exp_500000: { action: 'exp', label: '+500 000 опыта', reward: { heroExp: 500_000 } },
  admin_shards_500: { action: 'shards', label: '+500 шардов', reward: { shards: 500 } },
  admin_summon_100: { action: 'summons', label: '+100 свитков призыва', reward: { scrolls: 100 } },
  admin_souls_200: { action: 'souls', label: '+200 осколков душ (сверх капа — в кузницу)', reward: { souls: 200 } },
  admin_hero_all: { action: 'heroAll', label: 'Все легендарные герои выданы' },
  admin_hero_max: { action: 'heroMax', label: 'Все герои — максимальный уровень' },
  admin_star_max: { action: 'starMax', label: 'Все герои — E5 (еда выдана)' },
  admin_unlock_all: { action: 'unlockAll', label: 'Все режимы разблокированы' },
  admin_skip_tutorial: { action: 'skipTutorial', label: 'FTUE пропущен, стартовый набор выдан' },
  admin_set_stage_50: { action: 'setStage50', label: 'Кампания: этап 50', arg: 50 },
  admin_offline_12h: { action: 'offline12h', label: 'Оффлайн-доход за 12 часов начислен' },
  admin_force_win: { action: 'forceWin', label: 'Следующий бой — гарантированная победа' },
  admin_force_lose: { action: 'forceLose', label: 'Следующий бой — гарантированное поражение' },
  admin_log: { action: 'log', label: 'Последние 20 действий игрока' },
  admin_reset_save: { action: 'resetSave', label: 'Сброс сейва' },
};

export interface CodeAccount {
  id: number; // internal Telegram id (0 outside Telegram)
  devMode: boolean;
}

export interface CodeRateState {
  attempts: { at: number; ok: boolean }[];
  blockedUntil: number;
  usedByAccount: Record<string, number[]>; // code → timestamps of use by this account
  pendingResetAt: number | null;
  totalUses: Record<string, number>; // promo global usage counter (mock DB)
}

export function createRateState(): CodeRateState {
  return { attempts: [], blockedUntil: 0, usedByAccount: {}, pendingResetAt: null, totalUses: {} };
}

export type CodeResult =
  | { ok: true; effect: CodeEffect; label: string }
  | { ok: false; reason: string };

const INVALID = 'Код недействителен'; // never reveal the real reason

export interface ValidateOptions {
  config: CodeServerConfig;
  account: CodeAccount;
  rate: CodeRateState;
  now: number;
  usedCodes: string[]; // codes already redeemed by this account (from save)
  onLog: (entry: { code: string; ok: boolean; at: number; reason?: string }) => void;
}

export function validateCode(raw: string, opts: ValidateOptions): { result: CodeResult; rate: CodeRateState } {
  const { config, account, now, usedCodes, onLog } = opts;
  const rate: CodeRateState = JSON.parse(JSON.stringify(opts.rate)) as CodeRateState;
  const code = raw.trim().toUpperCase();

  // Rate limiting: ≤5 attempts/minute, 5 failures → 10-minute block
  rate.attempts = rate.attempts.filter((a) => now - a.at < 60_000);
  if (now < rate.blockedUntil) {
    const leftMin = Math.ceil((rate.blockedUntil - now) / 60_000);
    onLog({ code, ok: false, at: now, reason: 'blocked' });
    return { result: { ok: false, reason: `Слишком много попыток. Ввод заблокирован на ${leftMin} мин.` }, rate };
  }
  const recentFails = rate.attempts.filter((a) => !a.ok).length;
  if (rate.attempts.length >= 5 || recentFails >= 5) {
    rate.blockedUntil = now + 10 * 60_000;
    onLog({ code, ok: false, at: now, reason: 'rate-limit' });
    return { result: { ok: false, reason: 'Слишком много попыток. Ввод заблокирован на 10 минут.' }, rate };
  }

  const fail = (reason: string): { result: CodeResult; rate: CodeRateState } => {
    rate.attempts.push({ at: now, ok: false });
    onLog({ code, ok: false, at: now, reason });
    // Неверный код не показывает подсказок и не раскрывает причину (§15.4)
    return { result: { ok: false, reason: INVALID }, rate };
  };

  // admin_reset_save: double confirmation within 30 seconds (§15.3)
  if (code === 'ADMIN_RESET_SAVE' && rate.pendingResetAt !== null && now - rate.pendingResetAt <= 30_000) {
    rate.pendingResetAt = null;
    rate.attempts.push({ at: now, ok: true });
    onLog({ code, ok: true, at: now });
    return { result: { ok: true, effect: { kind: 'resetSave', needsSecondConfirm: true }, label: 'Сейв сброшен' }, rate };
  }

  // Promo codes — for everyone
  const promo = PROMO_CODES.find((p) => p.code === code);
  if (promo) {
    if (promo.code.length < 8) return fail('too-short');
    if (now > promo.expiresAt) return fail('expired');
    if (usedCodes.includes(promo.code)) return fail('already-used');
    const uses = rate.usedByAccount[promo.code] ?? [];
    if (uses.length >= 1) return fail('already-used');
    const total = rate.totalUses[promo.code] ?? 0;
    if (total >= promo.maxUses) return fail('limit');
    rate.totalUses[promo.code] = total + 1;
    rate.usedByAccount[promo.code] = [...uses, now];
    rate.attempts.push({ at: now, ok: true });
    onLog({ code, ok: true, at: now });
    return { result: { ok: true, effect: { kind: 'reward', reward: promo.reward, label: promo.label }, label: promo.label }, rate };
  }

  // Admin codes — only for whitelisted accounts (or dev mode)
  const adminKey = code.toLowerCase();
  const admin = ADMIN_CODES[adminKey];
  if (admin) {
    const allowed = config.allowAdminCodes || config.adminWhitelist.includes(account.id) || account.devMode;
    if (!allowed) return fail('not-whitelisted');
    // ≤5 uses of the same admin code per hour per account (§15.5)
    const uses = (rate.usedByAccount[adminKey] ?? []).filter((t) => now - t < 3600_000);
    if (uses.length >= 5) return fail('hour-limit');
    rate.usedByAccount[adminKey] = [...uses, now];
    rate.attempts.push({ at: now, ok: true });
    onLog({ code, ok: true, at: now });
    if (admin.action === 'resetSave') {
      rate.pendingResetAt = now;
      return { result: { ok: true, effect: { kind: 'resetSave', needsSecondConfirm: true }, label: 'Подтвердите сброс: введите код ещё раз в течение 30 секунд' }, rate };
    }
    return {
      result: {
        ok: true,
        effect: { kind: 'admin', action: admin.action, label: admin.label },
        label: admin.label,
      },
      rate,
    };
  }

  // Dev commands — dev mode only, never in production
  if (code.startsWith('DEV_')) {
    if (!account.devMode) return fail('dev-disabled');
    const rest = code.slice(4).replace(/_/g, ' ');
    const m = /^(.+?)(?:\s+(\d+))?$/.exec(rest);
    const command = (m?.[1] ?? rest).trim().replace(/\s+/g, '_').toLowerCase();
    const arg = m?.[2] !== undefined ? Number(m[2]) : undefined;
    rate.attempts.push({ at: now, ok: true });
    onLog({ code, ok: true, at: now });
    return { result: { ok: true, effect: { kind: 'dev', command, arg }, label: `Dev: ${command}` }, rate };
  }

  return fail('unknown');
}

export function randomPromoCode(rngSeed: number): string {
  // Promo codes are ≥8 chars, random, no obvious patterns (§15.3)
  const rng = createRng(rngSeed);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[rng.int(0, alphabet.length - 1)] ?? 'X';
  return out;
}
