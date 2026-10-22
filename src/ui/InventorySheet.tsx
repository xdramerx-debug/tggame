import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import type { InventoryRow, InventorySnapshot } from '@/game/loot/RunState';
import type { ItemSlotId } from '@/game/loot/itemTable';
import { hapticImpact, hapticSelection } from '@/telegram/haptic';
import { Sheet } from './components/Sheet';

interface InventorySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const SLOTS: readonly { readonly id: ItemSlotId; readonly label: string; readonly icon: string }[] = [
  { id: 'weapon', label: 'Оружие', icon: '⚔' },
  { id: 'armor', label: 'Броня', icon: '🛡' },
  { id: 'charm', label: 'Амулет', icon: '✦' },
];

/**
 * Inventory: three equipment slots plus a bag of twelve items.
 *
 * Everything in here is a plain snapshot polled from the scene at 10 Hz, so the
 * panel never shares mutable state with the game loop. Tap = equip, tap an
 * equipped slot = unequip; both cost one haptic tick and update the player's
 * stats immediately (the scene is what folds gear into `PlayerStats`).
 */
export function InventorySheet({ open, onClose }: InventorySheetProps): ReactElement {
  // Seeded from the scene on mount, then kept fresh by the polling timer.
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(() => gameHost.getInventorySnapshot());

  const refresh = useCallback((): void => {
    setSnapshot(gameHost.getInventorySnapshot());
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(refresh, 150);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const rows = snapshot?.bag ?? [];
  const capacity = snapshot?.capacity ?? 12;

  const equip = (row: InventoryRow): void => {
    hapticImpact('light');
    if (gameHost.equipItem(row.uid)) refresh();
  };

  const unequip = (slot: ItemSlotId): void => {
    hapticSelection();
    if (gameHost.unequipItem(slot)) refresh();
  };

  const totals = useMemo(() => describeTotals(snapshot), [snapshot]);

  return (
    <Sheet open={open} title="Снаряжение" onClose={onClose}>
      <div className="flex items-center justify-between pb-3">
        <p className="text-[13px] text-[#9aa3ae]" data-testid="inventory-totals">
          {totals}
        </p>
        <p className="hud-outline text-sm font-semibold text-gold" data-testid="inventory-gold">
          ◈ {snapshot?.gold ?? 0}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 pb-4">
        {SLOTS.map((slot) => {
          const item = snapshot?.equipped[slot.id] ?? null;
          return (
            <button
              key={slot.id}
              type="button"
              className="hud-panel flex min-h-[76px] flex-col items-center justify-center gap-1 px-2 py-2 text-center active:scale-[0.98]"
              style={item ? { borderColor: item.color } : undefined}
              onClick={() => (item ? unequip(slot.id) : undefined)}
              disabled={!item}
              aria-label={item ? `${slot.label}: ${item.label}` : `${slot.label}: пусто`}
              data-testid={`equip-slot-${slot.id}`}
              data-item={item?.defId ?? ''}
            >
              <span className="text-xl" aria-hidden="true">
                {item ? item.icon : slot.icon}
              </span>
              <span className="text-[11px] leading-tight" style={{ color: item ? item.color : '#5a6470' }}>
                {item ? item.label : slot.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-widest text-[#5a6470]">
          Сумка {rows.length}/{capacity}
        </h3>
      </div>

      {rows.length === 0 ? (
        <p className="pb-6 pt-2 text-center text-[13px] text-[#5a6470]" data-testid="inventory-empty">
          Пока пусто. Загляните в сундук или снимите добычу с врагов.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 overflow-y-auto pb-[calc(var(--safe-bottom)+8px)]" data-testid="inventory-bag">
          {rows.map((row) => (
            <li key={row.uid}>
              <button
                type="button"
                className="hud-panel flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:scale-[0.98]"
                style={{ borderColor: row.color }}
                onClick={() => equip(row)}
                data-testid={`item-${row.defId}`}
                aria-label={`${row.label}, ${row.rarityLabel}: ${row.statsText}. Надеть`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: row.color }}>
                    {row.label}
                  </span>
                  <span className="block truncate text-[11px] text-[#9aa3ae]">{row.statsText}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function describeTotals(snapshot: InventorySnapshot | null): string {
  if (!snapshot) return 'Нет данных';
  const parts: string[] = [];
  if (snapshot.totals.damage) parts.push(`+${snapshot.totals.damage} урона`);
  if (snapshot.totals.armor) parts.push(`+${snapshot.totals.armor} брони`);
  if (snapshot.totals.maxHp) parts.push(`+${snapshot.totals.maxHp} HP`);
  if (snapshot.totals.stamina) parts.push(`+${snapshot.totals.stamina} стамины`);
  if (snapshot.totals.critChance) parts.push(`+${Math.round(snapshot.totals.critChance * 100)} % крита`);
  return parts.length > 0 ? parts.join(' · ') : 'Без бонусов';
}
