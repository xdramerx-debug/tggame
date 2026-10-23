import type { ReactElement, ReactNode } from 'react';
import { FACTION_META, RANK_LABEL } from '../game/constants';
import { getHeroDef } from '../game/heroes';
import type { Faction, HeroState } from '../game/types';

export function Modal({ title, onClose, children, wide }: { title?: string; onClose?: () => void; children: ReactNode; wide?: boolean }): ReactElement {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={wide ? { maxWidth: 460 } : undefined} onClick={(e) => { e.stopPropagation(); }}>
        {title ? (
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="title-md">{title}</div>
            {onClose ? (
              <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Закрыть">✕</button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function FactionChip({ faction }: { faction: Faction }): ReactElement {
  const meta = FACTION_META[faction];
  return (
    <span className="faction-chip" style={{ color: meta.color, borderColor: `${meta.color}55` }}>
      {meta.emoji} {meta.name}
    </span>
  );
}

export function HeroAvatar({ hero, size, breath }: { hero: HeroState; size?: 'sm' | 'big'; breath?: boolean }): ReactElement {
  const def = getHeroDef(hero.defId);
  const meta = FACTION_META[def.faction];
  const rankLabel = RANK_LABEL[String(hero.rank)] ?? '5★';
  const high = typeof hero.rank !== 'number' || hero.rank >= 6;
  return (
    <div className={`hero-avatar ${size === 'big' ? 'big' : ''} ${high ? 'r6plus' : ''} ${breath === false ? '' : 'breath'}`}
      style={{ borderColor: meta.color, background: `radial-gradient(circle at 35% 30%, ${meta.color}33, transparent 65%), var(--panel)` }}>
      <span>{def.emoji}</span>
      <span className="rank-badge">{rankLabel}</span>
      {hero.pactHpBattles > 0 ? <span className="debuff-badge" title="Пакт: -20% HP">💔{hero.pactHpBattles}</span> : null}
      {hero.pactSilenceBattles > 0 ? <span className="debuff-badge" title="Пакт: не может кастовать">🤐{hero.pactSilenceBattles}</span> : null}
    </div>
  );
}

export function Stars({ rarity }: { rarity: number }): ReactElement {
  return <span className="stars">{'★'.repeat(rarity)}</span>;
}

export function Bar({ pct, className }: { pct: number; className?: string }): ReactElement {
  return (
    <div className={`hp-bar ${className ?? ''}`}>
      <div className="hp-fill" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, backgroundPosition: `${(1 - Math.max(0, Math.min(1, pct))) * 100}% 0` }} />
    </div>
  );
}

export function ResourceChip({ icon, value, title, dot }: { icon: string; value: string; title?: string; dot?: boolean }): ReactElement {
  return (
    <span className="res-chip" title={title}>
      <span>{icon}</span>
      <span>{value}</span>
      {dot ? <span className="badge-dot" /> : null}
    </span>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }): ReactElement {
  return (
    <div className="row-between" style={{ margin: '14px 2px 8px' }}>
      <div className="title-md">{children}</div>
      {right}
    </div>
  );
}
