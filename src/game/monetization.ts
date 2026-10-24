import type { RewardBundle } from './types';

/**
 * Monetization (§10): one-time Telegram Stars purchases + rewarded ads.
 * No subscriptions, no interstitials, no selling victory — only time & convenience.
 * In production the reward is granted only after the SERVER validates
 * successful_payment; the prototype emulates that validation step.
 */

export interface ShopPack {
  id: string;
  crystals: number;
  bonusCrystals?: number;
  stars: number; // Telegram Stars price
  usdLabel: string;
  oneTime?: boolean;
  extra?: RewardBundle;
  title: string;
}

export const SHOP_PACKS: ShopPack[] = [
  { id: 'starter', title: 'Стартовый набор', crystals: 300, stars: 50, usdLabel: '$0.99', oneTime: true, extra: { scrolls: 5, gold: 50_000 }, },
  { id: 'small', title: 'Горсть кристаллов', crystals: 120, stars: 80, usdLabel: '$0.99' },
  { id: 'medium', title: 'Ларец кристаллов', crystals: 400, bonusCrystals: 40, stars: 250, usdLabel: '$2.49' },
  { id: 'large', title: 'Сокровищница Эха', crystals: 900, bonusCrystals: 150, stars: 500, usdLabel: '$4.99' },
];

export type AdRewardKind = 'crystals50' | 'offlineX2' | 'skipBattle';

export const AD_REWARDS: Record<AdRewardKind, { title: string; desc: string }> = {
  crystals50: { title: '+50 💎', desc: 'Посмотреть рекламу и получить 50 кристаллов' },
  offlineX2: { title: 'x2 оффлайн-доход', desc: 'Удвоить накопленное, пока вас не было' },
  skipBattle: { title: 'Пропустить бой', desc: 'Мгновенный результат без потери награды' },
};

/** Mock of the server-side payment validation round-trip. */
export async function validatePurchaseServerSide(packId: string): Promise<{ ok: boolean; packId: string }> {
  await new Promise((r) => setTimeout(r, 600)); // имитация сетевого запроса
  return { ok: SHOP_PACKS.some((p) => p.id === packId), packId };
}
