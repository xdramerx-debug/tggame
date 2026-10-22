/**
 * Asset manifest — the runtime mirror of `scripts/build-assets.ts`.
 *
 * Every file listed here is produced by `npm run assets`; nothing is committed
 * as a binary except the generated output, which is reproducible from source.
 * Tests assert that the manifest and the generated `manifest.json` agree, so a
 * renamed model cannot silently ship as a 404.
 */
export interface CharacterAssetSpec {
  /** Path relative to `public/assets`. */
  readonly file: string;
  /** Clips the runtime expects; a missing one fails the asset test. */
  readonly clips: readonly string[];
}

export const CHARACTERS = {
  hero: {
    file: 'models/hero.glb',
    clips: ['idle', 'walk', 'run', 'attack', 'dodge', 'hit', 'death'],
  },
  monsterSkeleton: {
    file: 'models/monster-skeleton.glb',
    clips: ['idle', 'walk', 'attack', 'hit', 'death'],
  },
} as const satisfies Record<string, CharacterAssetSpec>;

export type CharacterId = keyof typeof CHARACTERS;

export const PROPS = {
  chest: 'models/chest.glb',
  altar: 'models/altar.glb',
  brazier: 'models/brazier.glb',
  torch: 'models/torch.glb',
  pillar: 'models/pillar.glb',
} as const;

export type PropId = keyof typeof PROPS;

/** Resolves an asset path against Vite's base URL (`./` inside Telegram WebView). */
export function assetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/${relativePath}`;
}
