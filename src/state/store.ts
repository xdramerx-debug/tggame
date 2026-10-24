import { create } from 'zustand';
import type { GameSnapshot, MetaProgress } from '../game/types';
import { PLAYER } from '../game/types';
import type { Game, RunSummary, UiEvent } from '../engine/game';
import { setMuted } from '../engine/audio';

/**
 * UI store — thin bridge between engine and React.
 * Engine pushes snapshots (~10 Hz) and events; UI never touches game math.
 */

const DEFAULT_SNAP: GameSnapshot = {
  phase: 'menu',
  run: 'skirmish',
  hp: PLAYER.maxHp,
  maxHp: PLAYER.maxHp,
  armor: 0,
  armorMax: PLAYER.armorMax,
  weapon: 'pistol',
  ammo: 12,
  magSize: 12,
  reserve: -1,
  reloading: false,
  reloadProgress: 0,
  grenades: 0,
  medkits: 0,
  money: 800,
  parts: 0,
  wave: 1,
  intermissionT: 0,
  enemiesLeft: 0,
  score: 0,
  kills: 0,
  level: 1,
  xpInto: 0,
  xpNeed: 120,
  perkPoints: 0,
  shopOpen: false,
  dashReady: 0,
  owned: ['pistol'],
  tuning: { pistol: 0, smg: 0, rifle: 0, shotgun: 0, sniper: 0 },
  minimap: [],
  px: 0,
  pz: 34,
  pyaw: Math.PI,
};

interface Banner {
  title: string;
  sub: string;
  tone: 'normal' | 'elite' | 'good';
}

interface KillfeedEntry {
  text: string;
  head: boolean;
  elite: boolean;
  id: number;
}

interface UiState {
  snap: GameSnapshot;
  engine: Game | null;
  banner: Banner | null;
  toast: string | null;
  killfeed: KillfeedEntry[];
  hurtTick: number;
  hurtAngle: number;
  hitmarkTick: number;
  hitHead: boolean;
  summary: RunSummary | null;
  meta: MetaProgress | null;
  muted: boolean;
  webglFailed: boolean;

  attachEngine: (g: Game) => void;
  detachEngine: () => void;
  applySnapshot: (s: GameSnapshot) => void;
  applyEvent: (e: UiEvent) => void;
  failWebgl: () => void;
  toggleMute: () => void;
  clearSummary: () => void;
}

let bannerTimer: number | null = null;
let toastTimer: number | null = null;
let hitTimer: number | null = null;
let kfId = 0;

export const useUi = create<UiState>()((set, get) => ({
  snap: DEFAULT_SNAP,
  engine: null,
  banner: null,
  toast: null,
  killfeed: [],
  hurtTick: 0,
  hurtAngle: 0,
  hitmarkTick: 0,
  hitHead: false,
  summary: null,
  meta: null,
  muted: false,
  webglFailed: false,

  attachEngine: (g) => {
    set({ engine: g, meta: g.getMeta() });
  },
  detachEngine: () => { set({ engine: null }); },

  applySnapshot: (s) => {
    set({ snap: s });
    const g = get().engine;
    if (g) set({ meta: g.getMeta() });
  },

  applyEvent: (e) => {
    switch (e.type) {
      case 'banner': {
        set({ banner: { title: e.title, sub: e.sub, tone: e.tone } });
        if (bannerTimer !== null) window.clearTimeout(bannerTimer);
        bannerTimer = window.setTimeout(() => {
          bannerTimer = null;
          set({ banner: null });
        }, 2200);
        break;
      }
      case 'toast': {
        set({ toast: e.text });
        if (toastTimer !== null) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          toastTimer = null;
          set({ toast: null });
        }, 1700);
        break;
      }
      case 'killfeed': {
        const entry: KillfeedEntry = { text: e.text, head: e.head, elite: e.elite, id: kfId++ };
        set((st) => ({ killfeed: [...st.killfeed.slice(-4), entry] }));
        window.setTimeout(() => {
          set((st) => ({ killfeed: st.killfeed.filter((k) => k.id !== entry.id) }));
        }, 2600);
        break;
      }
      case 'hurt': {
        set((st) => ({ hurtTick: st.hurtTick + 1, hurtAngle: e.angle }));
        break;
      }
      case 'hitmark': {
        set((st) => ({ hitmarkTick: st.hitmarkTick + 1, hitHead: e.head }));
        if (hitTimer !== null) window.clearTimeout(hitTimer);
        hitTimer = window.setTimeout(() => {
          hitTimer = null;
          set({ hitmarkTick: 0 });
        }, 180);
        break;
      }
      case 'levelup': {
        set({ toast: `⬆ ${e.text}` });
        if (toastTimer !== null) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          toastTimer = null;
          set({ toast: null });
        }, 2200);
        break;
      }
      case 'gameover': {
        set({ summary: e.summary, meta: get().engine?.getMeta() ?? get().meta });
        break;
      }
    }
  },

  failWebgl: () => { set({ webglFailed: true }); },

  toggleMute: () => {
    const muted = !get().muted;
    setMuted(muted);
    set({ muted });
  },

  clearSummary: () => { set({ summary: null }); },
}));
