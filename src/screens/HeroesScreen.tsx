import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { EQUIP_SLOTS, EQUIP_SLOT_NAME, FACTION_META, RANK_LABEL, RANK_ORDER, RANK_UP_COST, ROLE_META } from '../game/constants';
import { getHeroDef, HEROES } from '../game/heroes';
import { itemScore } from '../game/forge';
import { computeStats, levelUpCost, maxLevelForRank } from '../game/stats';
import type { EquipItem, Faction, HeroState, Role } from '../game/types';
import { fmt, heroPower, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { FactionChip, HeroAvatar, Modal, Stars } from '../components/ui';

export function HeroesScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const { auras: teamAuras } = useDerived();
  const levelUpHero = useGameStore((s) => s.levelUpHero);
  const rankUpHero = useGameStore((s) => s.rankUpHero);
  const ftueAdvance = useGameStore((s) => s.ftueAdvance);
  const ftue = game.ftue;

  const [fFaction, setFFaction] = useState<Faction | 'all'>('all');
  const [fRole, setFRole] = useState<Role | 'all'>('all');
  const [fUpgradable, setFUpgradable] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [equipFor, setEquipFor] = useState<{ uid: string; slot: string } | null>(null);

  const heroes = useMemo(() => {
    const list = Object.values(game.heroes);
    return list
      .filter((h) => {
        const d = getHeroDef(h.defId);
        if (fFaction !== 'all' && d.faction !== fFaction) return false;
        if (fRole !== 'all' && d.role !== fRole) return false;
        if (fUpgradable) {
          const cost = levelUpCost(h.level);
          const canLevel = game.resources.gold >= cost.gold && game.resources.heroExp >= cost.exp && h.level < maxLevelForRank(String(h.rank));
          if (!canLevel) return false;
        }
        return true;
      })
      .sort((a, b) => heroPower(b, teamAuras) - heroPower(a, teamAuras));
  }, [game.heroes, game.resources, fFaction, fRole, fUpgradable, teamAuras]);

  const hero = selected ? game.heroes[selected] : undefined;
  const ftueHighlight = !ftue.done && ftue.step === 2;

  const onLevelUp = (uid: string, times: number): void => {
    levelUpHero(uid, times);
    if (ftueHighlight && times === 1) ftueAdvance(); // FTUE шаг 3 выполнен — впереди второй бой
  };

  return (
    <div className="screen-scroll">
      {/* Filters */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <select className="btn btn-sm" value={fFaction} onChange={(e) => { setFFaction(e.target.value as Faction | 'all'); }} style={{ maxWidth: 130 }}>
          <option value="all">Все фракции</option>
          {(Object.keys(FACTION_META) as Faction[]).map((f) => (
            <option key={f} value={f}>{FACTION_META[f].emoji} {FACTION_META[f].name}</option>
          ))}
        </select>
        <select className="btn btn-sm" value={fRole} onChange={(e) => { setFRole(e.target.value as Role | 'all'); }} style={{ maxWidth: 130 }}>
          <option value="all">Все роли</option>
          {(Object.keys(ROLE_META) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_META[r].emoji} {ROLE_META[r].name}</option>
          ))}
        </select>
        <button className={`btn btn-sm ${fUpgradable ? 'btn-gold' : ''}`} onClick={() => { setFUpgradable(!fUpgradable); }}>⬆ Можно улучшить</button>
      </div>

      <div className="small" style={{ marginBottom: 8 }}>Коллекция: {Object.keys(game.heroes).length} / {HEROES.length} · «Еда»: {game.resources.fodder} 🍖</div>

      <div className="hero-grid">
        {heroes.map((h) => {
          const d = getHeroDef(h.defId);
          const inTeam = game.team.includes(h.uid);
          return (
            <button key={h.uid} className={`hero-card ${selected === h.uid ? 'selected' : ''}`} onClick={() => { setSelected(h.uid); }}>
              {inTeam ? <span className="slot-label">В ОТРЯДЕ</span> : null}
              <HeroAvatar hero={h} />
              <div style={{ fontWeight: 800, fontSize: 11, textAlign: 'center' }}>{d.name}</div>
              <Stars rarity={d.rarity} />
              <FactionChip faction={d.faction} />
              <div className="tiny">ур. {h.level} · сила {fmt(heroPower(h, teamAuras))}</div>
              {h.copies > 0 ? <div className="tiny" style={{ color: 'var(--shard)' }}>🔷 {h.copies} копий</div> : null}
            </button>
          );
        })}
      </div>
      {heroes.length === 0 ? <div className="muted" style={{ textAlign: 'center', marginTop: 24 }}>Никого не найдено — призовите героев во вкладке «Призыв»</div> : null}

      {ftueHighlight ? (
        <div className="ftue-hint">Отлично! Теперь улучши героя — открой карточку Велеса и нажми «Улучшить» ✨</div>
      ) : null}

      {/* Hero detail */}
      {hero ? (
        <HeroDetail
          hero={hero}
          onClose={() => { setSelected(null); }}
          onLevelUp={(times) => { onLevelUp(hero.uid, times); }}
          onRankUp={() => { rankUpHero(hero.uid); }}
          onEquipSlot={(slot) => { setEquipFor({ uid: hero.uid, slot }); }}
          onUnequip={(slot) => { useGameStore.getState().unequipItem(hero.uid, slot); }}
          onSalvage={(item) => { useGameStore.getState().salvageItem(item.uid, 'hero', hero.uid); }}
          ftueHighlight={ftueHighlight}
        />
      ) : null}

      {/* Equip picker */}
      {equipFor && hero ? (
        <Modal title={`${EQUIP_SLOT_NAME[equipFor.slot] ?? equipFor.slot} — выбрать предмет`} onClose={() => { setEquipFor(null); }}>
          <div className="col">
            {game.inventory.filter((i) => i.slot === equipFor.slot).length === 0 ? (
              <div className="muted small">Пусто. Выкуйте предмет в «Кузнице душ» ⚒️</div>
            ) : null}
            {game.inventory.filter((i) => i.slot === equipFor.slot).map((item) => {
              const current = hero.equip[item.slot];
              const better = !current || itemScore(item) > itemScore(current);
              return (
                <div key={item.uid} className="list-row">
                  <div style={{ flex: 1 }}>
                    <div className={`rarity-${item.rarity}`} style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div>
                    <div className="tiny">{bonusText(item)}{item.specialDesc ? ` · ✨ ${item.specialDesc}` : ''}</div>
                    {better ? <div className="tiny" style={{ color: 'var(--ok)' }}>▲ лучше текущего</div> : null}
                  </div>
                  <button className="btn btn-sm" onClick={() => { useGameStore.getState().equipItem(equipFor.uid, item); setEquipFor(null); }}>Надеть</button>
                </div>
              );
            })}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function bonusText(item: EquipItem): string {
  const b = item.bonus;
  const parts: string[] = [];
  if (b.hp) parts.push(`+${Math.round(b.hp * 100)}% HP`);
  if (b.atk) parts.push(`+${Math.round(b.atk * 100)}% ATK`);
  if (b.def) parts.push(`+${Math.round(b.def * 100)}% DEF`);
  if (b.spd) parts.push(`+${b.spd} SPD`);
  if (b.crit) parts.push(`+${Math.round(b.crit * 100)}% крит`);
  return parts.join(' · ');
}

function HeroDetail({ hero, onClose, onLevelUp, onRankUp, onEquipSlot, onUnequip, onSalvage, ftueHighlight }: {
  hero: HeroState;
  onClose: () => void;
  onLevelUp: (times: number) => void;
  onRankUp: () => void;
  onEquipSlot: (slot: string) => void;
  onUnequip: (slot: 'weapon' | 'armor' | 'trinket' | 'boots') => void;
  onSalvage: (item: EquipItem) => void;
  ftueHighlight: boolean;
}): ReactElement {
  const game = useGameStore((s) => s.game);
  const { auras: teamAuras } = useDerived();
  const d = getHeroDef(hero.defId);
  const stats = computeStats(hero, { auras: teamAuras });
  const maxLvl = maxLevelForRank(String(hero.rank));
  const cost = levelUpCost(hero.level);
  const canLevel = hero.level < maxLvl && game.resources.gold >= cost.gold && game.resources.heroExp >= cost.exp;
  const idx = RANK_ORDER.indexOf(hero.rank);
  const nextRank = RANK_ORDER[idx + 1];
  const rankCost = nextRank ? RANK_UP_COST[String(nextRank)] : undefined;
  const canRank = nextRank && rankCost && hero.copies >= rankCost.shards && game.resources.gold >= rankCost.gold && game.resources.fodder >= rankCost.fodder;

  return (
    <Modal title={d.name} onClose={onClose} wide>
      <div className="col" style={{ alignItems: 'center' }}>
        <HeroAvatar hero={hero} size="big" />
        <div className="row" style={{ gap: 6 }}>
          <Stars rarity={d.rarity} />
          <FactionChip faction={d.faction} />
          <span className="faction-chip">{ROLE_META[d.role].emoji} {ROLE_META[d.role].name}</span>
          <span className="faction-chip" style={{ color: 'var(--gold)' }}>{RANK_LABEL[String(hero.rank)]}</span>
        </div>
        <div className="small" style={{ fontStyle: 'italic' }}>«{d.title}»</div>
      </div>

      <div className="panel panel-tight" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 12 }}>
        <span>❤️ HP: <b>{fmt(stats.hp)}</b></span>
        <span>⚔️ ATK: <b>{fmt(stats.atk)}</b></span>
        <span>🛡 DEF: <b>{fmt(stats.def)}</b></span>
        <span>💨 SPD: <b>{stats.spd}</b></span>
        <span>💥 Крит: <b>{Math.round(stats.crit * 100)}%</b></span>
        <span>🔪 Пробитие: <b>{Math.round(stats.armorBreak * 100)}%</b></span>
      </div>

      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <div className="row-between">
          <b style={{ fontSize: 13 }}>✨ {d.skill.name} <span className="tiny">({Math.round(d.skill.chance * 100)}% шанс)</span></b>
        </div>
        <div className="small">{d.skill.desc}</div>
        <div className="tiny" style={{ marginTop: 4 }}>Пассивка «{d.passiveName}»: {d.passiveDesc}</div>
        {hero.pactSilenceBattles > 0 ? <div className="tiny" style={{ color: '#e9d5ff' }}>🤐 Пакт с тенью: не может кастовать ещё {hero.pactSilenceBattles} бой(я)</div> : null}
        {hero.pactHpBattles > 0 ? <div className="tiny" style={{ color: '#e9d5ff' }}>💔 Пакт с тенью: -20% HP ещё {hero.pactHpBattles} бой(я)</div> : null}
      </div>

      {/* Level */}
      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <div className="row-between">
          <div>
            <b style={{ fontSize: 13 }}>Уровень {hero.level} / {maxLvl}</b>
            <div className="tiny">Цена: {fmt(cost.gold)} 🪙 + {fmt(cost.exp)} опыта</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className={`btn ${canLevel ? 'btn-gold' : ''} ${ftueHighlight ? 'pulse-cta' : ''}`} style={{ flex: 1 }} disabled={!canLevel} onClick={() => { onLevelUp(1); }}>
            ⬆ Улучшить +1
          </button>
          <button className="btn" style={{ flex: 1 }} disabled={!canLevel} onClick={() => { onLevelUp(5); }}>+5</button>
        </div>
        {hero.level >= maxLvl ? <div className="tiny" style={{ marginTop: 4 }}>Максимум для ранга {RANK_LABEL[String(hero.rank)]} — повысьте звёзды</div> : null}
      </div>

      {/* Rank / stars */}
      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <div className="row-between">
          <b style={{ fontSize: 13 }}>Звёзды: {RANK_LABEL[String(hero.rank)]}{nextRank ? ` → ${RANK_LABEL[String(nextRank)]}` : ' (макс)'}</b>
          <span className="tiny">🔷 копий: {hero.copies}</span>
        </div>
        {rankCost ? (
          <>
            <div className="tiny">
              Нужно: {rankCost.shards} копий · {fmt(rankCost.gold)} 🪙
              {rankCost.fodder > 0 ? ` · ${rankCost.fodder} «еды» 🍖 (есть: ${game.resources.fodder})` : ''}
            </div>
            <button className={`btn btn-wide ${canRank ? 'btn-gold' : ''}`} style={{ marginTop: 6 }} disabled={!canRank} onClick={onRankUp}>
              ⭐ Повысить до {RANK_LABEL[String(nextRank)]}
            </button>
            {typeof nextRank === 'string' && nextRank.startsWith('E') ? (
              <div className="tiny" style={{ marginTop: 4 }}>Поглощение «еды» — неприятный, но нужный выбор: расходники видны выше</div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Equipment */}
      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <b style={{ fontSize: 13 }}>Экипировка</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
          {EQUIP_SLOTS.map((slot) => {
            const item = hero.equip[slot];
            return (
              <div key={slot} className="list-row" style={{ padding: 6, flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                <div className="tiny">{EQUIP_SLOT_NAME[slot]}</div>
                {item ? (
                  <>
                    <div className={`rarity-${item.rarity}`} style={{ fontWeight: 800, fontSize: 11 }}>{item.name}</div>
                    <div className="tiny">{bonusText(item)}</div>
                    {item.specialDesc ? <div className="tiny" style={{ color: 'var(--gold)' }}>✨ {item.specialDesc}</div> : null}
                    <div className="row" style={{ gap: 4, marginTop: 2 }}>
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { onUnequip(slot); }}>Снять</button>
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { onSalvage(item); }}>Разобрать</button>
                    </div>
                  </>
                ) : (
                  <button className="btn btn-sm" onClick={() => { onEquipSlot(slot); }}>Выбрать…</button>
                )}
              </div>
            );
          })}
        </div>
        <div className="tiny" style={{ marginTop: 4 }}>В сумке: {game.inventory.length} предмет(ов)</div>
      </div>
    </Modal>
  );
}

