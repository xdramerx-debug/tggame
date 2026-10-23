import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { MatchEngine } from '@/game/engine';
import type { MatchStats } from '@/game/engine';
import { InputController } from '@/input/controls';
import { FightStage } from '@/render/stage';
import type { QualityChoice, QualityLevel } from '@/render/stage';
import { sfx } from '@/audio/sfx';
import { haptic } from '@/platform/telegram';
import type { Difficulty } from '@/fight/ai';
import type { BattleEvent, BattleSnapshot, CharacterDef } from '@/fight/types';

interface UseFightOptions {
  readonly player: CharacterDef;
  readonly opponent: CharacterDef;
  readonly difficulty: Difficulty;
  readonly quality: QualityChoice;
  readonly sound: boolean;
  readonly onFinish: (payload: {
    readonly victory: boolean;
    readonly rounds: readonly [number, number];
    readonly stats: MatchStats;
    readonly durationSeconds: number;
  }) => void;
}

export interface FightApi {
  readonly canvasRef: RefObject<HTMLCanvasElement>;
  readonly controls: InputController;
  readonly hud: BattleSnapshot | null;
  readonly paused: boolean;
  readonly finished: boolean;
  readonly quality: QualityLevel;
  readonly error: string | null;
  setPaused: (paused: boolean) => void;
  rematch: () => void;
}

const HIT_COLORS: Readonly<Record<string, number>> = {
  acid: 0xb6e04a,
  beam: 0x6fe3ff,
  ember: 0xf0a13a,
};

/**
 * Wires the simulation, the renderer, the touch controls and the sound.
 *
 * The React tree never renders per simulation tick: the HUD is updated at a
 * capped rate while the 3D scene renders on every animation frame. All heavy
 * objects live in refs and are torn down on unmount.
 */
export function useFight(options: UseFightOptions): FightApi {
  const { player, opponent, difficulty, quality, sound, onFinish } = options;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [controls] = useState(() => new InputController());

  const [hud, setHud] = useState<BattleSnapshot | null>(null);
  const [paused, setPausedState] = useState(false);
  const [finished, setFinished] = useState(false);
  const [effectiveQuality, setEffectiveQuality] = useState<QualityLevel>(quality === 'auto' ? 'medium' : quality);
  const [error, setError] = useState<string | null>(null);

  const pausedRef = useRef(false);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPausedState(next);
    controls.clear();
    if (next) {
      sfx.suspend();
      sfx.stopAmbience();
    } else {
      sfx.resume();
      sfx.startAmbience();
    }
  }, [controls]);

  const engineRef = useRef<MatchEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialQuality: QualityLevel = quality === 'auto' ? 'medium' : quality;
    setError(null);

    // WebGL can be missing entirely (old WebView, blocked GPU). Fail loudly in
    // the HUD instead of throwing out of the effect and blanking the screen.
    let stage: FightStage;
    try {
      stage = new FightStage(canvas, initialQuality);
    } catch {
      setError('Этот телефон не тянет WebGL. Яма закрыта.');
      return;
    }
    stage.setFighters(player, opponent);
    const engine = new MatchEngine(player, opponent, difficulty);
    engineRef.current = engine;
    const startedAt = performance.now();
    let finishTimer = 0;

    sfx.unlock();
    if (sound) sfx.startAmbience();

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      stage.resize(rect.width, rect.height);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        setPaused(true);
      }
    };
    const onBlur = (): void => { setPaused(true); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    let raf = 0;
    let last = performance.now();
    let hudAccumulator = 0;
    let slowFrames = 0;
    let degraded = initialQuality === 'low';

    const playEvent = (event: BattleEvent): void => {
      switch (event.type) {
        case 'hit': {
          const snapshot = engine.battleSnapshot;
          const projectile = snapshot.projectiles[0];
          const color = projectile ? HIT_COLORS[projectile.spec.kind] ?? 0xffc27a : 0xffb057;
          stage.burst(event.x, event.y, color, event.heavy ? 22 : 12, event.heavy ? 1.3 : 0.85);
          stage.shakeCamera(event.heavy ? 0.9 : 0.4);
          sfx.play(event.heavy ? 'hitHeavy' : 'hitLight');
          if (event.heavy) haptic('medium');
          break;
        }
        case 'block':
          stage.burst(event.x, event.y, 0x9fc7ff, 8, 0.7);
          sfx.play('block');
          haptic('light');
          break;
        case 'whiff':
          sfx.play('whiff');
          break;
        case 'jump':
          sfx.play('jump');
          break;
        case 'land':
          stage.burst(event.x, 0.1, 0x8a7d6a, 6, 0.5);
          sfx.play('land');
          break;
        case 'special':
          sfx.play('special');
          haptic('light');
          break;
        case 'projectile':
          sfx.play('projectile');
          break;
        case 'ko':
          stage.shakeCamera(1.2);
          sfx.play('ko');
          haptic('heavy');
          break;
        case 'roundStart':
          sfx.play('round');
          stage.reset();
          break;
        case 'fight':
          haptic('light');
          break;
        case 'roundEnd':
          break;
        case 'matchEnd': {
          setFinished(true);
          const playerWon = event.winner === 0;
          sfx.play(playerWon ? 'win' : 'lose');
          haptic(playerWon ? 'success' : 'error');
          const view = engine.battleSnapshot;
          const stats = engine.stats;
          finishTimer = window.setTimeout(() => {
            finishRef.current({
              victory: playerWon,
              rounds: [view.fighters[0].roundsWon, view.fighters[1].roundsWon],
              stats,
              durationSeconds: Math.round((performance.now() - startedAt) / 1000),
            });
          }, 1900);
          break;
        }
      }
    };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (pausedRef.current) {
        const snapshot = engine.snapshot();
        stage.render(snapshot, 0);
        return;
      }

      const events = engine.advance(delta, controls.sample());
      for (const event of events) playEvent(event);

      const snapshot = engine.snapshot();
      stage.render(snapshot, delta);

      hudAccumulator += delta;
      if (hudAccumulator >= 1 / 30) {
        hudAccumulator = 0;
        setHud(snapshot);
      }

      // Auto-degrade: sustained sub-45 fps drops the preset instead of the fight.
      const fps = delta > 0 ? 1 / delta : 60;
      if (fps < 45) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (!degraded && slowFrames > 120) {
        degraded = true;
        stage.applyQuality('low');
        setEffectiveQuality('low');
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      window.clearTimeout(finishTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      sfx.stopAmbience();
      window.setTimeout(() => { stage.dispose(); }, 0);
      engineRef.current = null;
      controls.clear();
    };
  }, [player, opponent, difficulty, quality, sound, controls, setPaused]);

  const rematch = useCallback(() => {
    engineRef.current?.restart();
    setFinished(false);
    setPaused(false);
    controls.clear();
  }, [controls, setPaused]);

  return {
    canvasRef,
    controls,
    hud,
    paused,
    finished,
    quality: effectiveQuality,
    error,
    setPaused,
    rematch,
  };
}
