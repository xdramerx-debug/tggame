import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { installDebugBridge } from '@/game/debug';
import { useGameStore, useUiStore } from '@/store/useGameStore';
import { PerfOverlay } from './components/PerfOverlay';
import { InputLayer } from '@/input';
import type { InteractionHint } from '@/input/types';
import { hapticImpact } from '@/telegram/haptic';
import { setCloseConfirmation } from '@/telegram/viewport';
import { DangerVignette, HealthBar, useVitals } from './components/VitalsHud';
import { InventorySheet } from './InventorySheet';
import { DeathScreen } from './DeathScreen';
import { BossBar } from './components/BossBar';
import { PauseOverlay } from './PauseOverlay';
import { useMetaStore } from '@/store/useMetaStore';
import type { RunSummary } from '@/game/scenes/DungeonScene';

/** Polls the scene for an interaction offer; cheap and only while in a run. */
function useInteractionHint(): InteractionHint | null {
  const [hint, setHint] = useState<InteractionHint | null>(null);

  useEffect(() => {
    const poll = (): void => {
      const next = gameHost.getInteractionHint();
      setHint((previous) => {
        if (previous === next) return previous;
        if (previous && next && previous.available === next.available && previous.label === next.label) {
          return previous;
        }
        return next;
      });
    };
    poll();
    const timer = window.setInterval(poll, 150);
    return () => window.clearInterval(timer);
  }, []);

  return hint;
}

function Bar({
  label,
  value,
  max = 100,
  color,
}: {
  readonly label: string;
  readonly value: number;
  readonly max?: number;
  readonly color: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <span className="w-4 text-[10px] font-bold uppercase tracking-wider text-[#9aa3ae]">{label}</span>
      <HealthBar value={value} max={max} color={color} />
    </div>
  );
}

/**
 * In-run screen: HUD skeleton, touch controls and the pause path.
 *
 * The HUD values are static until the survival systems arrive (stage 8); the
 * input layer underneath is already the final one.
 */
/** Short-lived toast in the upper third; never blocks input (200 ms fade). */
function HudToast(): ReactElement | null {
  const message = useGameStore((state) => state.message);
  const clearMessage = useGameStore((state) => state.clearMessage);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => clearMessage(), 1800);
    return () => window.clearTimeout(timer);
  }, [message, clearMessage]);

  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-40 flex justify-center">
      <p key={message.id} className="fade-enter hud-panel hud-outline px-4 py-2 text-center text-[13px] font-semibold text-gold">
        {message.text}
      </p>
    </div>
  );
}

export function GameScreen(): ReactElement {
  const setScreen = useGameStore((state) => state.setScreen);
  const interactionHint = useInteractionHint();
  const vitals = useVitals();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [death, setDeath] = useState<RunSummary | null>(null);

  const openSettings = useUiStore((state) => state.openSheet);
  const grantRun = useMetaStore((state) => state.grantRun);
  const reward = useMetaStore((state) => state.lastReward);

  // The scene reports the end of a run; the overlay replaces the HUD. Embers are
  // paid out here, once per run, because the engine only knows the summary.
  useEffect(
    () =>
      gameHost.setDeathListener((summary) => {
        setInventoryOpen(false);
        setDeath(summary);
        grantRun({
          kills: summary.kills,
          floor: summary.floor,
          chestsOpened: summary.chestsOpened,
          cause: summary.cause,
          seconds: summary.seconds,
        });
      }),
    [grantRun],
  );

  useEffect(() => {
    setCloseConfirmation(true);
    return () => setCloseConfirmation(false);
  }, []);

  useEffect(() => installDebugBridge(() => gameHost.getDebugSnapshot()), []);

  // Dev-only collider wireframes (`?physics=1`) and a training dummy (`?dummy=1`).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    gameHost.setPhysicsDebug(params.get('physics') === '1');
    // `?xp=120` banks experience so the level-up banner and XP bar are reachable
    // without fighting two floors' worth of monsters. The scene is built after
    // boot, so the grant retries until the level actually moves.
    const requestedXp = Number.parseInt(params.get('xp') ?? '', 10);
    if (Number.isFinite(requestedXp) && requestedXp > 0) {
      const xpTimer = window.setInterval(() => {
        gameHost.debugGrantXp(requestedXp);
        const level = gameHost.getDebugSnapshot()?.scene.level ?? 1;
        if (level > 1) window.clearInterval(xpTimer);
      }, 250);
      const stopXp = window.setTimeout(() => window.clearInterval(xpTimer), 6000);
      return () => {
        window.clearInterval(xpTimer);
        window.clearTimeout(stopXp);
      };
    }
    if (params.get('dummy') === '1') gameHost.spawnDummy();
    // `?boss=1` walks the player into the arena: the boss bar and phase changes
    // are then reachable without clearing two floors first.
    if (params.get('boss') === '1') {
      const spawnTimer = window.setInterval(() => {
        gameHost.debugBossArena();
        if (gameHost.getBossState() !== null) window.clearInterval(spawnTimer);
      }, 250);
      const stopTimer = window.setTimeout(() => window.clearInterval(spawnTimer), 5000);
      return () => {
        window.clearInterval(spawnTimer);
        window.clearTimeout(stopTimer);
      };
    }
    // `?kill=1` ends the run immediately: the death screen must be reachable
    // without waiting for a monster to land a finishing blow. The scene may
    // still be building on the first frames, so retry until it takes effect.
    if (params.get('kill') !== '1') return;
    const timer = window.setInterval(() => {
      gameHost.debugHurt(10_000);
      if (gameHost.getDebugSnapshot()?.scene.dead === true) window.clearInterval(timer);
    }, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 6000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  // The bag pauses the run: the panel is modal and the player must not be hit
  // while reading item stats.
  const openInventory = useCallback((): void => {
    hapticImpact('light');
    setInventoryOpen(true);
    gameHost.setMoveInput({ x: 0, y: 0, magnitude: 0 });
    gameHost.pause();
  }, []);

  const closeInventory = useCallback((): void => {
    setInventoryOpen(false);
    gameHost.resume();
  }, []);

  const eatRation = (): void => {
    hapticImpact('light');
    gameHost.eatRation();
  };

  const restartRun = (): void => {
    hapticImpact('medium');
    setDeath(null);
    gameHost.restartRun();
  };

  const pauseToMenu = (): void => {
    hapticImpact('light');
    setPauseOpen(false);
    gameHost.setMoveInput({ x: 0, y: 0, magnitude: 0 });
    gameHost.pause();
    setScreen('menu');
  };

  // The pause button freezes the run instead of dropping straight to the menu:
  // losing a twenty-minute run to a mis-tap on ☰ is not a difficulty curve.
  const openPause = (): void => {
    hapticImpact('light');
    setPauseOpen(true);
    gameHost.setMoveInput({ x: 0, y: 0, magnitude: 0 });
    gameHost.pause();
  };

  const closePause = (): void => {
    setPauseOpen(false);
    gameHost.resume();
  };

  return (
    <div className="safe-pad absolute inset-0 fade-enter">
      {/* Input surface sits under the HUD; HUD itself is pointer-transparent.
          While the death screen is up there is nothing left to steer. */}
      {death ? null : <InputLayer interactionHint={interactionHint} />}

      <div className="pointer-events-none relative z-30 flex items-start justify-between p-3">
        <div className="flex flex-col gap-1">
        <div className="hud-panel flex flex-col gap-1.5 px-2.5 py-2" style={{ opacity: 'var(--hud-opacity)' }}>
          <Bar label="HP" value={vitals.hp} max={vitals.maxHp} color="linear-gradient(90deg,#7d1f1f,#b33a3a)" />
          <Bar label="ST" value={vitals.stamina} color="linear-gradient(90deg,#2f5c52,#4a7c8c)" />
          <Bar
            label="HG"
            value={vitals.satiety}
            color={
              vitals.hunger === 'starving'
                ? 'linear-gradient(90deg,#7a2020,#c9a227)'
                : 'linear-gradient(90deg,#6b4e2e,#c9a227)'
            }
          />
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gold" data-testid="level-label" data-level={vitals.level}>
              Lv.{vitals.level}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#5a6470]" data-testid="floor-label">
              Этаж {vitals.floor}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#5a6470]" data-testid="kill-label">
              ☠ {vitals.kills}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-gold/80" data-testid="gold-label">
              ◈ {vitals.gold}
            </span>
          </div>
        </div>

        {/* Run level: a thin bar under the panel, no layout shift on level-up. */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-black/70" aria-label="Опыт">
          <div
            className="h-full bg-gradient-to-r from-[#6b4e2e] to-gold transition-[width] duration-200"
            style={{
              width: `${vitals.xpToNext > 0 ? Math.min(100, Math.round((vitals.xpInLevel / vitals.xpToNext) * 100)) : 100}%`,
            }}
            data-testid="xp-fill"
            data-xp={vitals.xpInLevel}
            data-xp-to-next={vitals.xpToNext}
          />
        </div>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            className="hud-panel flex h-[48px] w-[48px] items-center justify-center text-lg active:scale-95"
            aria-label="Меню"
            onPointerDown={() => hapticImpact('light')}
            onClick={openPause}
            data-testid="pause-button"
          >
            ☰
          </button>
          <button
            type="button"
            className={`hud-panel relative flex h-[48px] w-[48px] items-center justify-center text-lg active:scale-95 ${
              vitals.hunger === 'fed' ? 'opacity-60' : ''
            }`}
            aria-label={`Съесть паёк, осталось: ${vitals.rations}`}
            aria-disabled={vitals.rations === 0}
            onPointerDown={() => hapticImpact('light')}
            onClick={eatRation}
            data-testid="ration-button"
            data-rations={vitals.rations}
          >
            🍖
            <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-black/80 px-1 text-[10px] font-bold leading-[18px] text-gold">
              {vitals.rations}
            </span>
          </button>
          <button
            type="button"
            className="hud-panel relative flex h-[48px] w-[48px] items-center justify-center text-lg active:scale-95"
            aria-label={`Инвентарь, предметов: ${vitals.items}`}
            onPointerDown={() => hapticImpact('light')}
            onClick={openInventory}
            data-testid="inventory-button"
          >
            🎒
            {vitals.items > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-gold px-1 text-[10px] font-bold leading-[18px] text-black">
                {vitals.items}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <BossBar />
      <PauseOverlay
        open={pauseOpen && death === null}
        floor={vitals.floor}
        level={vitals.level}
        kills={vitals.kills}
        onResume={closePause}
        onSettings={() => openSettings('settings')}
        onMenu={pauseToMenu}
      />
      <InventorySheet open={inventoryOpen} onClose={closeInventory} />
      {death ? (
        <DeathScreen
          summary={death}
          reward={reward}
          onRestart={restartRun}
          onAltar={() => {
            setDeath(null);
            pauseToMenu();
            setScreen('meta');
          }}
          onMenu={() => {
            setDeath(null);
            pauseToMenu();
          }}
        />
      ) : null}
      <DangerVignette hp={vitals.hp} maxHp={vitals.maxHp} />
      <HudToast />
      <PerfOverlay />

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+6px)] z-0 flex justify-center">
        <p className="hud-panel hud-outline px-3 py-1 text-center text-[11px] leading-snug text-[#9aa3ae]">
          v1.0.0 · ?seed=42 · ?quality=low · ?reset=1
        </p>
      </div>
    </div>
  );
}
