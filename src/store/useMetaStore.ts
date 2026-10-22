import { create } from 'zustand';
import { metaStorage } from '@/game/meta/metaStorage';
import type { MetaState, RunOutcome, UpgradeView } from '@/game/meta/MetaState';
import { gameHost } from '@/game/GameHost';
import { StatsRepository } from '@/db/repository';

const statsRepository = new StatsRepository();

/** QA/Playwright view of the economy (dev builds only, read-only). */
export interface MetaDebugSnapshot {
  readonly embers: number;
  readonly levels: Readonly<Record<string, number>>;
  /** Number of purchase calls received, and how many of them succeeded. */
  readonly attempts: number;
  readonly purchases: number;
  readonly lastHint: string;
}

declare global {
  interface Window {
    __TENEBRIS_META__?: () => MetaDebugSnapshot;
  }
}

let attempts = 0;
let purchases = 0;
let lastHint = '';

export interface MetaStoreState {
  readonly loaded: boolean;
  readonly embers: number;
  readonly upgrades: readonly UpgradeView[];
  /** Embers granted by the run that just ended (shown on the death screen). */
  readonly lastReward: number;
  hydrate: () => Promise<void>;
  purchase: (id: string) => boolean;
  grantRun: (outcome: RunOutcome) => number;
}

function view(state: MetaState): Pick<MetaStoreState, 'embers' | 'upgrades' | 'loaded'> {
  return { embers: state.embers, upgrades: state.upgradeViews(), loaded: true };
}

/**
 * Reactive face of `MetaState`.
 *
 * The economy itself lives in `MetaState` (pure, unit-tested) and is persisted
 * by `MetaStorage`; this store only mirrors it for React and forwards purchases
 * to the live engine so a bought upgrade applies to the next run.
 */
export const useMetaStore = create<MetaStoreState>()((set, get) => {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__TENEBRIS_META__ = () => ({
      embers: get().embers,
      levels: Object.fromEntries(get().upgrades.map((upgrade) => [upgrade.id, upgrade.level])),
      attempts,
      purchases,
      lastHint,
    });
  }
  return ({
  loaded: false,
  embers: 0,
  upgrades: [],
  lastReward: 0,

  hydrate: async () => {
    const state = await metaStorage.load();
    // QA hook (`?embers=100`): a full altar must be reachable in E2E without
    // farming ten runs. Dev builds only — production never reads this param.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const requested = Number.parseInt(
        new URLSearchParams(window.location.search).get('embers') ?? '',
        10,
      );
      if (Number.isFinite(requested) && requested > 0) metaStorage.update((meta) => meta.addEmbers(requested));
    }
    // Upgrades bought in the menu must reach the scene the engine will create.
    gameHost.setMetaBonuses(state.bonuses(), state.startingRations());
    set(view(state));
  },

  purchase: (id) => {
    attempts += 1;
    const before = metaStorage.value.levelOf(id);
    const state = metaStorage.update((meta) => {
      meta.purchase(id);
    });
    const bought = state.levelOf(id) > before;
    if (bought) purchases += 1;
    // React state first: the altar must reflect the purchase even if the live
    // engine refuses the new bonuses (it is dead between runs, for instance).
    set(view(state));
    try {
      gameHost.setMetaBonuses(state.bonuses(), state.startingRations());
      lastHint = `${id}:${bought ? 'ok' : 'refused'}`;
    } catch (error) {
      lastHint = `${id}:engine-error:${String(error)}`;
      console.warn('[meta] applying bonuses to the engine failed', error);
    }
    return bought;
  },

  grantRun: (outcome) => {
    // The `stats` table is the only history that survives a death.
    void statsRepository.record({
      kills: outcome.kills,
      items: outcome.chestsOpened,
      seconds: outcome.seconds ?? 0,
      floor: outcome.floor,
    });
    let reward = 0;
    const state = metaStorage.update((meta) => {
      reward = meta.grantRun(outcome);
    });
    gameHost.setMetaBonuses(state.bonuses(), state.startingRations());
    set({ ...view(state), lastReward: reward });
    return get().lastReward;
  },
  });
});
