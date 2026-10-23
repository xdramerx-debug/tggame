import type { ReactElement } from 'react';
import type { CharacterDef } from '@/fight/types';

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

interface PortraitProps {
  readonly def: CharacterDef;
  readonly className?: string;
  readonly dim?: boolean;
}

/**
 * Hand-drawn-in-code silhouettes of the roster.
 *
 * CSS/SVG portraits keep the select screen instant while the 3D stage stays
 * reserved for the fight itself — no extra WebGL contexts on a phone.
 */
export function Portrait({ def, className, dim = false }: PortraitProps): ReactElement {
  const skin = hex(def.palette.skin);
  const accent = hex(def.palette.accent);
  const cloth = hex(def.palette.cloth);
  const glow = hex(def.palette.glow);

  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden="true" style={{ filter: dim ? 'grayscale(0.75) brightness(0.5)' : undefined }}>
      <defs>
        <radialGradient id={`glow-${def.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body-${def.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={skin} />
          <stop offset="100%" stopColor={cloth} />
        </linearGradient>
      </defs>

      <ellipse cx="60" cy="142" rx="38" ry="6" fill="#000" opacity="0.5" />

      {def.model.kind === 'brute' && (
        <g>
          <ellipse cx="60" cy="104" rx="42" ry="34" fill={`url(#body-${def.id})`} />
          <ellipse cx="60" cy="112" rx="30" ry="22" fill={skin} opacity="0.55" />
          <rect x="22" y="82" width="16" height="44" rx="8" fill={skin} />
          <rect x="82" y="82" width="16" height="44" rx="8" fill={skin} />
          <circle cx="60" cy="58" r="22" fill={skin} />
          <ellipse cx="60" cy="66" rx="13" ry="9" fill={cloth} />
          <path d="M48 70 L44 84 L52 76 Z" fill={accent} />
          <path d="M72 70 L76 84 L68 76 Z" fill={accent} />
          <circle cx="52" cy="54" r="3.4" fill={glow} />
          <circle cx="68" cy="54" r="3.4" fill={glow} />
          <path d="M36 96 q10 -8 22 -2" stroke={accent} strokeWidth="3" fill="none" />
        </g>
      )}

      {def.model.kind === 'stitched' && (
        <g>
          <rect x="46" y="52" width="28" height="70" rx="12" fill={`url(#body-${def.id})`} />
          <path d="M46 74 h28 M46 92 h28 M46 108 h28" stroke={accent} strokeWidth="2" strokeDasharray="4 3" />
          <rect x="22" y="60" width="12" height="52" rx="6" fill={skin} transform="rotate(-14 28 60)" />
          <rect x="86" y="60" width="12" height="52" rx="6" fill={skin} transform="rotate(14 92 60)" />
          <rect x="30" y="92" width="11" height="46" rx="5" fill={skin} transform="rotate(10 35 92)" />
          <rect x="79" y="92" width="11" height="46" rx="5" fill={skin} transform="rotate(-10 84 92)" />
          <path d="M48 40 q12 -14 24 0 v14 q-12 10 -24 0 Z" fill={cloth} />
          <path d="M50 42 q10 -8 20 0" stroke={accent} strokeWidth="2" fill="none" strokeDasharray="3 2" />
          <circle cx="66" cy="45" r="4" fill={glow} />
          <circle cx="60" cy="50" r="26" fill={`url(#glow-${def.id})`} opacity="0.35" />
        </g>
      )}

      {def.model.kind === 'eye' && (
        <g>
          <rect x="52" y="92" width="16" height="44" rx="7" fill={`url(#body-${def.id})`} />
          <path d="M60 96 q-26 10 -20 38" stroke={skin} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M60 96 q26 10 20 38" stroke={skin} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="60" cy="56" r="40" fill={`url(#glow-${def.id})`} opacity="0.5" />
          <circle cx="60" cy="58" r="32" fill={skin} />
          <circle cx="60" cy="58" r="18" fill={glow} opacity="0.9" />
          <circle cx="60" cy="58" r="9" fill="#08060a" />
          <circle cx="54" cy="52" r="4" fill="#fff" opacity="0.8" />
          <path d="M32 34 l6 8 M88 34 l-6 8 M28 58 h10 M82 58 h10 M34 82 l8 -6 M86 82 l-8 -6" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {def.model.kind === 'furnace' && (
        <g>
          <rect x="34" y="74" width="52" height="58" rx="8" fill={cloth} />
          <rect x="42" y="92" width="36" height="26" rx="3" fill={glow} opacity="0.95" />
          <path d="M42 100 h36 M42 108 h36" stroke={cloth} strokeWidth="3" />
          <rect x="24" y="78" width="12" height="48" rx="6" fill="#3a383e" />
          <rect x="84" y="78" width="12" height="48" rx="6" fill="#3a383e" />
          <rect x="44" y="46" width="32" height="26" rx="4" fill="#4a474d" />
          <rect x="48" y="57" width="24" height="5" rx="2" fill={glow} />
          <rect x="38" y="34" width="9" height="26" rx="4" fill="#3a383e" />
          <rect x="73" y="30" width="9" height="30" rx="4" fill="#3a383e" />
          <circle cx="42" cy="30" r="4" fill={glow} opacity="0.8" />
          <circle cx="78" cy="26" r="4" fill={glow} opacity="0.8" />
          <circle cx="60" cy="102" r="34" fill={`url(#glow-${def.id})`} opacity="0.4" />
        </g>
      )}
    </svg>
  );
}
