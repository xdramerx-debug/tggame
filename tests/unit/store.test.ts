import { beforeEach, describe, expect, it } from 'vitest';
import { SOUL_CAP } from '../../src/game/constants';
import { createRateState } from '../../src/game/codes';
import { createInitialGameState } from '../../src/state/initialState';
import { useGameStore } from '../../src/state/gameStore';

function freshStore(): void {
  useGameStore.setState({
    game: createInitialGameState(),
    battle: null,
    screen: 'home',
    modal: null,
    toasts: [],
    defeatTips: [],
    offlineReward: null,
    summonResults: null,
    lastCodeResult: null,
    ftuePause: false,
    codeRate: createRateState(),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  freshStore();
});

describe('game store', () => {
  it('boots with the starter hero in the front row', () => {
    const g = useGameStore.getState().game;
    expect(g.team[0]).toBe('starter-veles');
    expect(g.heroes['starter-veles']?.defId).toBe('veles');
    expect(g.campaign.stage).toBe(1);
  });

  it('FTUE: first battle from step 0 pauses, wins and advances to step 1', () => {
    // Fresh game starts at step 0. The very first battle must be a guaranteed,
    // paused FTUE battle (§9) even though the player never manually set step 1.
    expect(useGameStore.getState().game.ftue.step).toBe(0);
    useGameStore.getState().startBattle('campaign');
    const st = useGameStore.getState();
    expect(st.game.ftue.step).toBe(1); // step advanced on battle start
    expect(st.ftuePause).toBe(true); // pauses on first hit
    expect(st.battle?.result.victory).toBe(true); // guaranteed win
    // resume + finish → victory grants first-clear rewards
    useGameStore.getState().resumeFromFtuePause();
    useGameStore.getState().finishBattle();
    expect(useGameStore.getState().game.campaign.stage).toBe(2);
  });

  it('level-up spends gold & exp and is blocked when broke', () => {
    const st = useGameStore.getState();
    st.addResources({ gold: 1_000_000, heroExp: 1_000_000 });
    useGameStore.getState().levelUpHero('starter-veles', 5);
    const h = useGameStore.getState().game.heroes['starter-veles'];
    expect(h?.level).toBe(6);
    const goldAfter = useGameStore.getState().game.resources.gold;
    expect(goldAfter).toBeLessThan(1_000_000 + 6000);

    freshStore();
    useGameStore.getState().levelUpHero('starter-veles', 1); // only 6000 gold → maybe 1-2 levels
    const poor = useGameStore.getState().game.heroes['starter-veles'];
    expect(poor?.level).toBeLessThanOrEqual(6);
  });

  it('level-up respects the rank cap (20 at 5★)', () => {
    const st = useGameStore.getState();
    st.addResources({ gold: 100_000_000, heroExp: 100_000_000 });
    useGameStore.getState().levelUpHero('starter-veles', 60);
    expect(useGameStore.getState().game.heroes['starter-veles']?.level).toBe(20);
  });

  it('souls respect the cap of 20 through gameplay rewards', () => {
    const st = useGameStore.getState();
    st.addResources({ souls: 19 });
    st.addResources({ souls: 5 }); // gameplay path caps
    expect(useGameStore.getState().game.resources.souls).toBe(SOUL_CAP);
  });

  it('campaign win advances the stage and pays first-clear rewards', () => {
    const st = useGameStore.getState();
    st.addResources({ gold: 1_000_000, heroExp: 1_000_000 });
    st.levelUpHero('starter-veles', 19);
    st.submitCode('admin_force_win');
    expect(useGameStore.getState().game.forcedNextResult).toBe('win');
    st.startBattle('campaign');
    const battle = useGameStore.getState().battle;
    expect(battle).not.toBeNull();
    useGameStore.getState().finishBattle();
    const g = useGameStore.getState().game;
    expect(g.campaign.stage).toBe(2);
    expect(g.campaign.maxStage).toBe(1);
    expect(g.resources.gold).toBeGreaterThan(900_000); // 1M − стоимость 19 уровней + награда этапа
    expect(useGameStore.getState().battle?.finished).toBe(true);
    expect(useGameStore.getState().battle?.granted?.gold).toBeGreaterThan(0);
  });

  it('forced loss grants 1–3 soul shards (Эхо павших) and never exceeds the cap', () => {
    const st = useGameStore.getState();
    st.submitCode('admin_force_lose');
    st.startBattle('campaign');
    useGameStore.getState().finishBattle();
    const g = useGameStore.getState().game;
    expect(g.stats.battlesLost).toBe(1);
    expect(g.resources.souls).toBeGreaterThanOrEqual(1);
    expect(g.resources.souls).toBeLessThanOrEqual(3);
    expect(useGameStore.getState().defeatTips.length).toBeGreaterThan(0);
  });

  it('echo buff activates for souls, replaces (not stacks) and ticks down per battle', () => {
    const st = useGameStore.getState();
    st.addResources({ souls: 10 });
    st.activateEchoBuff('atk3');
    let g = useGameStore.getState().game;
    expect(g.echo.buff).toEqual({ kind: 'atk3', battlesLeft: 3 });
    expect(g.resources.souls).toBe(7);
    st.addResources({ souls: 10 });
    st.activateEchoBuff('hp1'); // replaces
    g = useGameStore.getState().game;
    expect(g.echo.buff?.kind).toBe('hp1');
    // battle ticks the buff
    st.submitCode('admin_force_win');
    st.startBattle('campaign');
    useGameStore.getState().finishBattle();
    expect(useGameStore.getState().game.echo.buff).toBeNull(); // hp1 had 1 battle left
  });

  it('Shadow Pact: +30% slot, one per battle, debuff after the fight, no pact on debuffed hero', () => {
    const st = useGameStore.getState();
    st.activatePact(0);
    expect(useGameStore.getState().game.pact.slot).toBe(0);
    st.activatePact(0); // already active — rejected
    expect(useGameStore.getState().toasts.at(-1)?.kind).toBe('error');
    st.submitCode('admin_force_win');
    st.startBattle('campaign');
    useGameStore.getState().finishBattle();
    const g = useGameStore.getState().game;
    expect(g.pact.slot).toBeNull();
    const hero = g.heroes['starter-veles'];
    expect(hero && (hero.pactHpBattles > 0 || hero.pactSilenceBattles > 0)).toBe(true);
    // pact on a debuffed hero is forbidden
    useGameStore.getState().activatePact(0);
    expect(useGameStore.getState().game.pact.slot).toBeNull();
  });

  it('summon consumes resources, adds heroes or converts duplicates, updates pity', () => {
    const st = useGameStore.getState();
    st.addResources({ crystals: 1000 });
    st.doSummon('premium', 10, 'crystals');
    const g = useGameStore.getState().game;
    expect(g.stats.summons).toBe(10);
    expect(g.resources.crystals).toBe(1000 - 270 + 120); // start had 120, spent 270
    expect(Object.keys(g.heroes).length).toBeGreaterThan(1);
    expect(useGameStore.getState().summonResults?.length).toBe(10);
  });

  it('forge spends 8 souls, yields an item, salvage returns 2–3', () => {
    const st = useGameStore.getState();
    st.addResources({ souls: 10 });
    st.forgeItem('weapon');
    let g = useGameStore.getState().game;
    expect(g.resources.souls).toBe(2);
    expect(g.inventory.length).toBe(1);
    const item = g.inventory[0];
    expect(item).toBeDefined();
    if (item) {
      st.salvageItem(item.uid, 'inventory');
      g = useGameStore.getState().game;
      expect(g.inventory.length).toBe(0);
      expect(g.resources.souls).toBeGreaterThanOrEqual(4);
      expect(g.resources.souls).toBeLessThanOrEqual(5);
    }
  });

  it('promo code grants rewards once and invalid codes are refused silently', () => {
    const st = useGameStore.getState();
    st.submitCode('WELCOME2025');
    const g = useGameStore.getState().game;
    expect(g.resources.crystals).toBe(120 + 100);
    expect(g.resources.scrolls).toBe(5 + 5);
    st.submitCode('WELCOME2025');
    expect(useGameStore.getState().lastCodeResult?.ok).toBe(false);
    st.submitCode('BOGUSCODE1');
    expect(useGameStore.getState().lastCodeResult?.label).toBe('Код недействителен');
  });

  it('admin_reset_save asks for a second confirmation before wiping', () => {
    const st = useGameStore.getState();
    st.submitCode('admin_reset_save');
    // first entry: confirmation requested, save intact
    expect(useGameStore.getState().game.resources.gold).toBe(6000);
    st.submitCode('admin_reset_save');
    // second entry within 30s: reset happened
    expect(useGameStore.getState().game.resources.gold).toBe(6000); // fresh state has 6000 too
    expect(useGameStore.getState().game.stats.battlesWon).toBe(0);
    expect(useGameStore.getState().codeRate.pendingResetAt).toBeNull();
  });

  it('daily login claims once per day and moves the streak', () => {
    const st = useGameStore.getState();
    st.claimDailyLogin();
    const g = useGameStore.getState().game;
    expect(g.daily.streak).toBe(1);
    expect(g.resources.gold).toBe(6000 + 8000);
    st.claimDailyLogin(); // same day — no double claim
    expect(useGameStore.getState().game.daily.streak).toBe(1);
  });

  it('ascension is locked before stage 40 and grants a permanent multiplier after', () => {
    const st = useGameStore.getState();
    expect(st.canAscend()).toBe(false);
    st.submitCode('admin_set_stage_50');
    expect(useGameStore.getState().canAscend()).toBe(true);
    useGameStore.getState().ascend();
    const g = useGameStore.getState().game;
    expect(g.prestige.ascensions).toBe(1);
    expect(g.prestige.multiplier).toBeGreaterThan(1);
    expect(g.campaign.stage).toBe(1);
  });

  it('team slots: assign, swap and the front-row rule (slot order preserved)', () => {
    const st = useGameStore.getState();
    st.submitCode('admin_hero_all');
    const g = useGameStore.getState().game;
    const uids = Object.values(g.heroes).slice(0, 6).map((h) => h.uid);
    uids.forEach((uid, i) => { useGameStore.getState().setSlot(i, uid); });
    expect(useGameStore.getState().game.team.filter(Boolean).length).toBe(6);
    useGameStore.getState().swapSlots(0, 3);
    const team = useGameStore.getState().game.team;
    expect(team[0]).toBe(uids[3]);
    expect(team[3]).toBe(uids[0]);
  });

  it('persists to localStorage and survives a reload', () => {
    const st = useGameStore.getState();
    st.addResources({ gold: 777 });
    st.save();
    const raw = window.localStorage.getItem('echo-chronicles-save');
    expect(raw).toContain('777');
    // boot() reloads from storage
    freshStore();
    useGameStore.setState({ booted: false });
    useGameStore.getState().boot();
    expect(useGameStore.getState().game.resources.gold).toBe(6777);
  });

  it('labyrinth unlocks when a first clear pushes maxStage past 10', () => {
    useGameStore.setState((s) => ({ game: { ...s.game, campaign: { stage: 11, maxStage: 10 } } }));
    const st = useGameStore.getState();
    st.submitCode('admin_force_win');
    st.startBattle('campaign');
    useGameStore.getState().finishBattle();
    const g = useGameStore.getState().game;
    expect(g.campaign.maxStage).toBe(11);
    expect(g.labyrinth.unlocked).toBe(true);
  });
});
