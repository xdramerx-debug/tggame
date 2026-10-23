import { useState } from 'react';
import type { ReactElement } from 'react';
import { EQUIP_SLOTS, EQUIP_SLOT_NAME, FORGE_COST_SOULS, FORGE_ODDS, SOUL_CAP } from '../game/constants';
import { getHeroDef } from '../game/heroes';
import { itemScore, rarityLabel } from '../game/forge';
import type { EquipItem, EquipSlot } from '../game/types';
import { useGameStore } from '../state/gameStore';
import { HeroAvatar, Modal, SectionTitle } from '../components/ui';

/**
 * «Кузница душ» (14.2): risky crafting from soul shards. The odds are on
 * screen before you craft; a worse roll can be salvaged for 2–3 souls back;
 * legendaries carry unique battle effects.
 */
export function ForgeScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const forgeItem = useGameStore((s) => s.forgeItem);
  const salvageItem = useGameStore((s) => s.salvageItem);
  const equipItem = useGameStore((s) => s.equipItem);
  const [slot, setSlot] = useState<EquipSlot>('weapon');
  const [last, setLast] = useState<EquipItem | null>(null);
  const [pickHero, setPickHero] = useState<EquipItem | null>(null);

  const souls = game.resources.souls;

  const onForge = (): void => {
    const before = game.inventory.length;
    forgeItem(slot);
    const after = useGameStore.getState().game.inventory;
    if (after.length > before) setLast(after[after.length - 1] ?? null);
  };

  return (
    <div className="screen-scroll">
      <SectionTitle right={<span className="res-chip">👻 {souls} / {SOUL_CAP}</span>}>⚒️ Кузница душ</SectionTitle>

      <div className="panel" style={{ textAlign: 'center' }}>
        <div className="forge-flames">🔥⚒️🔥</div>
        <div className="small muted">Крафт из осколков душ. Результат неизвестен — но вероятности честные:</div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, margin: '8px 0' }}>
          {FORGE_ODDS.map((o) => (
            <span key={o.rarity} className={`res-chip rarity-${o.rarity}`}>{rarityLabel(o.rarity)}: {Math.round(o.p * 100)}%</span>
          ))}
        </div>

        <div className="seg" style={{ margin: '10px 0' }}>
          {EQUIP_SLOTS.map((s) => (
            <button key={s} className={slot === s ? 'on' : ''} onClick={() => { setSlot(s); }}>{EQUIP_SLOT_NAME[s]}</button>
          ))}
        </div>

        <button className="btn btn-cta btn-wide" disabled={souls < FORGE_COST_SOULS} onClick={onForge}>
          ⚒️ Выковать ({FORGE_COST_SOULS} 👻)
        </button>
        <div className="tiny" style={{ marginTop: 6 }}>
          Осколки добываются в «Эхе павших» (поражения), лабиринте и редких наградах. Легендарные предметы дают уникальный эффект ✨
        </div>
      </div>

      {last ? (
        <div className="panel" style={{ marginTop: 10, borderColor: 'var(--gold)' }}>
          <div className="tiny">ПОСЛЕДНЯЯ КОВКА</div>
          <div className={`rarity-${last.rarity}`} style={{ fontWeight: 900, fontSize: 15 }}>{last.name}</div>
          <div className="small">{bonusText(last)}</div>
          {last.specialDesc ? <div className="small rarity-legendary">✨ {last.specialDesc}</div> : null}
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { setPickHero(last); }}>Надеть на героя</button>
            <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { salvageItem(last.uid, 'inventory'); setLast(null); }}>
              Разобрать (+2–3 👻)
            </button>
          </div>
        </div>
      ) : null}

      <SectionTitle>Сумка ({game.inventory.length})</SectionTitle>
      <div className="col">
        {game.inventory.length === 0 ? <div className="muted small">Пусто — выкуйте первый предмет</div> : null}
        {game.inventory.map((item) => (
          <div key={item.uid} className="list-row">
            <div style={{ flex: 1 }}>
              <div className={`rarity-${item.rarity}`} style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div>
              <div className="tiny">{EQUIP_SLOT_NAME[item.slot]} · {bonusText(item)}{item.specialDesc ? ` · ✨ ${item.specialDesc}` : ''}</div>
            </div>
            <button className="btn btn-sm" onClick={() => { setPickHero(item); }}>Надеть</button>
            <button className="btn btn-sm" onClick={() => { salvageItem(item.uid, 'inventory'); }}>👻</button>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />

      {pickHero ? (
        <Modal title={`Надеть «${pickHero.name}»`} onClose={() => { setPickHero(null); }}>
          <div className="hero-grid">
            {Object.values(game.heroes).map((h) => {
              const d = getHeroDef(h.defId);
              const current = h.equip[pickHero.slot];
              const better = !current || itemScore(pickHero) > itemScore(current);
              return (
                <button key={h.uid} className="hero-card" onClick={() => { equipItem(h.uid, pickHero); setPickHero(null); setLast(null); }}>
                  <HeroAvatar hero={h} breath={false} />
                  <div style={{ fontWeight: 800, fontSize: 10, textAlign: 'center' }}>{d.name}</div>
                  <div className="tiny">{current ? `текущий: ${rarityLabel(current.rarity)}` : 'слот пуст'}</div>
                  {better ? <div className="tiny" style={{ color: 'var(--ok)' }}>▲ лучше</div> : <div className="tiny" style={{ color: 'var(--danger)' }}>▼ хуже (можно разобрать)</div>}
                </button>
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

