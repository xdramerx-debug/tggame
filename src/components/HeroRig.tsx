import { useId } from 'react';
import { motion } from 'framer-motion';
import type { HeroVisualSpec } from '@/game/types';

export type RigAnimState = 'idle' | 'attack' | 'ult' | 'hit' | 'dead';

export interface HeroRigProps {
  readonly visual: HeroVisualSpec;
  readonly facing?: 'left' | 'right';
  readonly size?: number;
  readonly stars?: number;
  readonly isBoss?: boolean;
  readonly frozen?: boolean;
  readonly burning?: boolean;
  readonly energyReady?: boolean;
  readonly animState?: RigAnimState;
}

export function HeroRig({
  visual,
  facing = 'right',
  size = 86,
  stars = 1,
  isBoss = false,
  frozen = false,
  burning = false,
  energyReady = false,
  animState = 'idle',
}: HeroRigProps) {
  const uid = useId().replace(/:/g, '');
  const dir = facing === 'right' ? 1 : -1;

  const dashX = animState === 'attack' ? 26 * dir : animState === 'ult' ? 16 * dir : animState === 'hit' ? -10 * dir : 0;
  const jumpY = animState === 'ult' ? -18 : animState === 'attack' ? -5 : 0;
  const rigScale = animState === 'ult' ? 1.24 : animState === 'attack' ? 1.09 : animState === 'dead' ? 0.78 : 1;

  return (
    <motion.div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center pointer-events-none select-none"
      animate={{
        x: dashX,
        y: jumpY,
        scale: rigScale,
        opacity: animState === 'dead' ? 0.16 : 1,
        rotate: animState === 'dead' ? -24 * dir : animState === 'hit' ? -8 * dir : 0,
      }}
      transition={{ type: 'spring', stiffness: 460, damping: 24 }}
    >
      {/* Ultimate ready radiant aura pulse */}
      {energyReady && animState !== 'dead' && (
        <div
          className="absolute inset-1 rounded-full blur-md animate-pulse-glow"
          style={{
            background: `radial-gradient(circle, ${visual.glow}88 0%, transparent 72%)`,
          }}
        />
      )}

      <svg
        viewBox="0 0 120 120"
        className="w-full h-full overflow-visible"
        style={{ transform: facing === 'left' ? 'scaleX(-1)' : undefined }}
      >
        <defs>
          <linearGradient id={`armor_${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={visual.secondary} />
            <stop offset="45%" stopColor={visual.primary} />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id={`blade_${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={visual.glow} />
            <stop offset="100%" stopColor={visual.primary} />
          </linearGradient>
          <radialGradient id={`aura_${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={visual.glow} stopOpacity="0.6" />
            <stop offset="65%" stopColor={visual.primary} stopOpacity="0.2" />
            <stop offset="100%" stopColor={visual.primary} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground Shadow & Sacred Faction Aura Ring */}
        <ellipse cx="60" cy="106" rx={isBoss ? 38 : 29} ry="8" fill="#020617" opacity="0.65" />
        <g className="hero-rune-pulse">
          <ellipse
            cx="60"
            cy="105"
            rx={isBoss ? 36 : 27}
            ry="7.5"
            fill={`url(#aura_${uid})`}
            stroke={visual.glow}
            strokeWidth={stars >= 3 || isBoss ? '1.6' : '1'}
            strokeDasharray="6 4"
          />
          {(stars >= 4 || isBoss) && (
            <ellipse
              cx="60"
              cy="105"
              rx={isBoss ? 43 : 33}
              ry="9.5"
              fill="none"
              stroke={visual.secondary}
              strokeWidth="1.1"
              opacity="0.7"
            />
          )}
        </g>

        {/* Main Breathing Rig Container */}
        <g className={animState === 'idle' ? 'hero-rig-idle' : ''}>
          {/* Back Layer: Wings / Cape / Halo / Tendrils */}
          <g className="hero-wing-anim">
            {visual.back === 'seraph_wings' && (
              <g opacity="0.95">
                <path d="M52 60 C24 34, 8 38, 14 54 C24 54, 36 58, 48 66 Z" fill={`url(#blade_${uid})`} />
                <path d="M50 66 C20 52, 6 62, 16 74 C26 72, 38 72, 48 73 Z" fill={visual.secondary} />
                <path d="M50 72 C24 70, 14 82, 24 89 C33 85, 41 81, 49 78 Z" fill={visual.primary} />
              </g>
            )}
            {visual.back === 'phoenix_wings' && (
              <g>
                <path
                  d="M52 62 C25 28, 10 38, 18 58 C12 62, 14 74, 26 78 C36 78, 44 74, 52 74 Z"
                  fill={`url(#blade_${uid})`}
                />
                <circle cx="22" cy="42" r="3" fill={visual.secondary} />
              </g>
            )}
            {visual.back === 'ice_crystals' && (
              <g opacity="0.9">
                <polygon points="24,38 32,26 36,42 28,50" fill={visual.secondary} stroke="#ffffff" strokeWidth="1" />
                <polygon points="18,60 26,50 30,66 21,72" fill={visual.glow} />
                <polygon points="32,22 39,14 42,27" fill="#ffffff" />
              </g>
            )}
            {visual.back === 'orbit_rings' && (
              <g>
                <ellipse
                  cx="56"
                  cy="54"
                  rx="34"
                  ry="14"
                  transform="rotate(-28 56 54)"
                  fill="none"
                  stroke={visual.secondary}
                  strokeWidth="2"
                />
                <circle cx="26" cy="68" r="4" fill={visual.glow} />
                <circle cx="84" cy="39" r="3.5" fill="#ffffff" />
              </g>
            )}
            {visual.back === 'void_tendrils' && (
              <g opacity="0.9">
                <path d="M52 58 C26 42, 12 52, 18 66 C26 62, 36 64, 48 68 Z" fill={visual.primary} />
                <path d="M50 70 C24 68, 14 84, 24 92 C32 84, 40 80, 50 78 Z" fill={visual.glow} />
              </g>
            )}
            {(visual.back === 'cape' ||
              visual.back === 'fur_cloak' ||
              visual.back === 'leaf_mantle' ||
              visual.back === 'wraith_shroud' ||
              visual.back === 'scarf' ||
              visual.back === 'star_quiver' ||
              visual.back === 'chains') && (
              <path
                d="M46 54 L22 92 C32 96, 44 95, 54 90 L58 56 Z"
                fill={visual.primary}
                stroke={visual.secondary}
                strokeWidth="1.3"
                opacity="0.92"
              />
            )}
          </g>

          {/* Boots & Stance Legs */}
          <path d="M47 82 L43 102 L52 103 L55 84 Z" fill="#1e293b" stroke={visual.secondary} strokeWidth="1.2" />
          <path d="M63 82 L67 102 L76 103 L70 84 Z" fill="#1e293b" stroke={visual.secondary} strokeWidth="1.2" />

          {/* Armored Torso & Pauldrons */}
          <path
            d="M42 54 C42 48, 76 48, 76 54 L72 85 C62 88, 54 88, 46 85 Z"
            fill={`url(#armor_${uid})`}
            stroke="#f8fafc"
            strokeOpacity="0.45"
            strokeWidth="1.3"
          />
          {/* Glowing Core Gem */}
          <polygon points="59,58 64,65 59,72 54,65" fill={visual.glow} stroke="#ffffff" strokeWidth="1" />
          {/* Left Pauldron */}
          <path d="M36 56 C36 47, 48 46, 52 54 L46 64 C40 64, 36 61, 36 56 Z" fill={visual.secondary} />
          {/* Right Pauldron */}
          <path d="M67 54 C72 46, 84 47, 84 56 C84 61, 79 64, 73 64 Z" fill={visual.secondary} />

          {/* Head, Face & Signature Helm */}
          <g>
            <circle cx="59" cy="37" r="15.5" fill={visual.skin} stroke="#0f172a" strokeWidth="1.5" />

            {/* Expressive Glowing Eyes */}
            <ellipse cx="55.5" cy="38.5" rx="2.4" ry="3" fill="#0f172a" />
            <ellipse cx="65.5" cy="38.5" rx="2.4" ry="3" fill="#0f172a" />
            <circle cx="56" cy="38" r="1.4" fill={visual.eye} />
            <circle cx="66" cy="38" r="1.4" fill={visual.eye} />

            {/* Headgear Variants */}
            {visual.head === 'knight_crest' && (
              <g>
                <path d="M42 36 C42 20, 76 20, 76 36 L72 31 L59 35 L46 31 Z" fill={`url(#armor_${uid})`} />
                <path d="M56 21 C54 9, 68 8, 73 19 C66 20, 61 22, 56 21 Z" fill={visual.secondary} />
              </g>
            )}
            {visual.head === 'hooded_rogue' && (
              <path
                d="M40 41 C40 18, 77 17, 78 39 C72 29, 49 29, 40 41 Z"
                fill={visual.primary}
                stroke={visual.secondary}
                strokeWidth="1.4"
              />
            )}
            {visual.head === 'antler_crown' && (
              <g>
                <path d="M43 32 C48 23, 70 23, 75 32" fill="none" stroke={visual.secondary} strokeWidth="3.5" />
                <path d="M46 27 L37 13 M42 20 L34 20" stroke={visual.secondary} strokeWidth="2.6" strokeLinecap="round" />
                <path d="M72 27 L81 13 M76 20 L84 20" stroke={visual.secondary} strokeWidth="2.6" strokeLinecap="round" />
                <circle cx="59" cy="24" r="3.5" fill={visual.glow} />
              </g>
            )}
            {visual.head === 'ice_tiara' && (
              <g>
                <polygon points="45,29 52,17 59,25 66,14 73,29" fill={visual.secondary} stroke="#ffffff" strokeWidth="1.2" />
                <path d="M42 33 C42 24, 50 22, 46 44 Z" fill="#e0f2fe" />
              </g>
            )}
            {visual.head === 'viking_horns' && (
              <g>
                <path d="M43 34 C44 21, 74 21, 75 34 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="1.5" />
                <path d="M45 28 C33 24, 31 14, 39 11 C40 19, 44 22, 47 25 Z" fill="#f8fafc" />
                <path d="M73 28 C85 24, 87 14, 79 11 C78 19, 74 22, 71 25 Z" fill="#f8fafc" />
              </g>
            )}
            {visual.head === 'phoenix_crown' && (
              <g>
                <polygon points="44,30 50,15 57,25 63,11 69,25 75,16 74,31" fill={`url(#blade_${uid})`} />
              </g>
            )}
            {visual.head === 'berserker_mane' && (
              <path
                d="M40 38 C37 22, 50 15, 58 21 C65 13, 79 20, 77 36 C70 28, 49 28, 40 38 Z"
                fill={visual.primary}
              />
            )}
            {visual.head === 'moon_circlet' && (
              <g>
                <path d="M42 34 C44 21, 74 21, 76 34 C69 27, 49 27, 42 34 Z" fill={visual.primary} />
                <circle cx="59" cy="24" r="4" fill={visual.secondary} />
              </g>
            )}
            {visual.head === 'reaper_cowl' && (
              <path
                d="M39 44 C39 16, 79 16, 79 44 C73 30, 46 30, 39 44 Z"
                fill="#0f172a"
                stroke={visual.glow}
                strokeWidth="1.5"
              />
            )}
            {visual.head === 'valkyrie_wings' && (
              <g>
                <path d="M44 32 C46 20, 72 20, 74 32 Z" fill={visual.secondary} />
                <path d="M45 30 L28 17 L34 31 L44 35 Z" fill="#ffffff" stroke={visual.primary} strokeWidth="1" />
                <path d="M73 30 L90 17 L84 31 L74 35 Z" fill="#ffffff" stroke={visual.primary} strokeWidth="1" />
              </g>
            )}
            {visual.head === 'void_horns' && (
              <g>
                <path d="M47 26 L35 9 L53 23 Z" fill={visual.secondary} />
                <path d="M71 26 L83 9 L65 23 Z" fill={visual.secondary} />
                <polygon points="59,16 63,25 59,29 55,25" fill={visual.glow} />
              </g>
            )}
            {visual.head === 'halo_visor' && (
              <g>
                <circle cx="59" cy="15" r="7" fill="none" stroke={visual.secondary} strokeWidth="2.2" />
                <rect x="49" y="34" width="22" height="6" rx="3" fill={visual.glow} />
              </g>
            )}
            {visual.head === 'demon_skull' && (
              <g>
                <path d="M42 34 C43 19, 75 19, 76 34 L69 29 L59 33 L49 29 Z" fill={visual.primary} />
                <path d="M45 25 L31 11 L49 21 Z" fill={visual.secondary} />
                <path d="M73 25 L87 11 L69 21 Z" fill={visual.secondary} />
              </g>
            )}
          </g>

          {/* Off-hand Shield for Tank */}
          {visual.weapon === 'shield_axe' && (
            <path
              d="M72 52 L92 56 L89 82 L79 91 L70 81 Z"
              fill={`url(#armor_${uid})`}
              stroke="#ffffff"
              strokeWidth="1.8"
            />
          )}

          {/* Main Articulated Weapon Layer */}
          <g
            className={animState === 'idle' ? 'hero-weapon-anim' : ''}
            style={{
              transform:
                animState === 'attack'
                  ? 'rotate(36deg) translate(8px, -6px)'
                  : animState === 'ult'
                    ? 'rotate(-28deg) scale(1.14)'
                    : undefined,
              transformOrigin: '74px 66px',
              transition: 'transform 160ms ease-out',
            }}
          >
            {(visual.weapon === 'greatsword' || visual.weapon === 'void_blade') && (
              <g>
                <rect x="74" y="62" width="12" height="4" rx="2" fill={visual.secondary} />
                <polygon
                  points="80,62 84,18 89,12 92,20 86,62"
                  fill={`url(#blade_${uid})`}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              </g>
            )}
            {visual.weapon === 'dual_daggers' && (
              <g>
                <polygon points="75,65 98,48 93,62" fill={`url(#blade_${uid})`} />
                <polygon points="42,66 22,52 29,66" fill={`url(#blade_${uid})`} />
              </g>
            )}
            {(visual.weapon === 'nature_staff' || visual.weapon === 'frost_scepter') && (
              <g>
                <line x1="78" y1="95" x2="86" y2="24" stroke={visual.secondary} strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="87" cy="21" r="7.5" fill={`url(#blade_${uid})`} />
                <circle cx="87" cy="21" r="11" fill="none" stroke={visual.glow} strokeWidth="1.3" />
              </g>
            )}
            {(visual.weapon === 'shield_axe' || visual.weapon === 'twin_axes') && (
              <g>
                <line x1="42" y1="86" x2="34" y2="34" stroke="#cbd5e1" strokeWidth="3.2" />
                <path d="M35 36 C19 30, 17 50, 36 52 Z" fill={`url(#blade_${uid})`} stroke="#ffffff" strokeWidth="1" />
              </g>
            )}
            {visual.weapon === 'moon_bow' && (
              <g>
                <path
                  d="M78 26 C98 42, 98 76, 78 92"
                  fill="none"
                  stroke={`url(#blade_${uid})`}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <line x1="78" y1="26" x2="78" y2="92" stroke="#ffffff" strokeWidth="1.1" opacity="0.8" />
                <line x1="72" y1="59" x2="102" y2="59" stroke={visual.glow} strokeWidth="2.4" />
              </g>
            )}
            {visual.weapon === 'frost_scythe' && (
              <g>
                <line x1="74" y1="96" x2="86" y2="22" stroke="#cbd5e1" strokeWidth="3.2" />
                <path d="M86 24 C109 22, 114 38, 96 47 C99 35, 92 31, 84 31 Z" fill={`url(#blade_${uid})`} />
              </g>
            )}
            {visual.weapon === 'radiant_spear' && (
              <g>
                <line x1="74" y1="98" x2="92" y2="12" stroke={visual.secondary} strokeWidth="3.4" />
                <polygon points="92,6 85,26 92,22 99,26" fill="#ffffff" stroke={visual.glow} strokeWidth="1.2" />
              </g>
            )}
            {visual.weapon === 'astrolabe' && (
              <g>
                <circle cx="88" cy="48" r="11" fill="none" stroke={visual.secondary} strokeWidth="2" />
                <polygon points="88,39 92,48 88,57 84,48" fill={`url(#blade_${uid})`} />
              </g>
            )}
            {(visual.weapon === 'monster_claw' || visual.weapon === 'boss_mace') && (
              <g>
                <line x1="76" y1="88" x2="90" y2="26" stroke="#475569" strokeWidth="4.2" />
                <circle cx="91" cy="24" r="10" fill={`url(#blade_${uid})`} />
                <polygon points="91,10 87,18 95,18" fill="#ffffff" />
                <polygon points="104,24 96,20 96,28" fill="#ffffff" />
              </g>
            )}
          </g>
        </g>

        {/* Status FX Overlays inside SVG */}
        {frozen && (
          <polygon
            points="35,98 46,24 68,18 85,42 84,98"
            fill="#38bdf8"
            fillOpacity="0.42"
            stroke="#e0f2fe"
            strokeWidth="2"
          />
        )}
        {burning && (
          <g opacity="0.85">
            <circle cx="44" cy="78" r="5" fill="#fb923c" />
            <circle cx="75" cy="72" r="4" fill="#facc15" />
          </g>
        )}
      </svg>

      {/* White Impact Hit Flash */}
      {animState === 'hit' && (
        <div
          className="absolute inset-2 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.75) 0%, transparent 68%)',
          }}
        />
      )}
    </motion.div>
  );
}
