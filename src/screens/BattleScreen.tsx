import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Crown,
  FastForward,
  Flame,
  Gift,
  Sparkles,
  Zap,
} from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { BattleVfxCanvas } from '@/components/BattleVfxCanvas';
import type { VfxBurstCommand, VfxPoint } from '@/components/BattleVfxCanvas';
import { HeroRig } from '@/components/HeroRig';
import type { RigAnimState } from '@/components/HeroRig';
import { UltCutIn } from '@/components/UltCutIn';
import type { UltCutInData } from '@/components/UltCutIn';
import { buildAllyUnits, castAstralMeteorStrike, stepBattleTurn } from '@/game/combat';
import type { TurnEngineState } from '@/game/combat';
import { computeFactionAura, formatCompactNumber } from '@/game/heroes';
import { buildStageDefinition } from '@/game/stages';
import type { BattleUnit } from '@/game/types';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';

interface FloatingNumber {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly subtext?: string;
  readonly kind: 'normal' | 'crit' | 'heal' | 'shield';
}

const ALLY_COORDS: readonly VfxPoint[] = [
  { x: 0.31, y: 0.43 }, // slot 0 front-top
  { x: 0.31, y: 0.72 }, // slot 1 front-bottom
  { x: 0.13, y: 0.3 },  // slot 2 back-top
  { x: 0.13, y: 0.56 }, // slot 3 back-mid
  { x: 0.13, y: 0.81 }, // slot 4 back-bottom
];

const ENEMY_COORDS: readonly VfxPoint[] = [
  { x: 0.69, y: 0.43 }, // slot 0 front-top
  { x: 0.69, y: 0.72 }, // slot 1 front-bottom
  { x: 0.87, y: 0.3 },  // slot 2 back-top
  { x: 0.87, y: 0.56 }, // slot 3 back-mid
  { x: 0.87, y: 0.81 }, // slot 4 back-bottom
];

function getUnitPoint(unit: BattleUnit): VfxPoint {
  const table = unit.side === 'ally' ? ALLY_COORDS : ENEMY_COORDS;
  return table[unit.slot] ?? { x: 0.5, y: 0.5 };
}

let floatSeq = 1;
let vfxSeq = 1;

export function BattleScreen() {
  const currentStage = useGameStore((s) => s.currentStage);
  const maxStage = useGameStore((s) => s.maxStage);
  const lineup = useGameStore((s) => s.lineup);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const relics = useGameStore((s) => s.relics);
  const battleSpeed = useGameStore((s) => s.battleSpeed);
  const autoUlt = useGameStore((s) => s.autoUlt);
  const autoAdvance = useGameStore((s) => s.autoAdvance);
  const quickRaidsUsed = useGameStore((s) => s.quickRaidsUsed);
  const lastIdleClaimAt = useGameStore((s) => s.lastIdleClaimAt);

  const setBattleSpeed = useGameStore((s) => s.setBattleSpeed);
  const toggleAutoUlt = useGameStore((s) => s.toggleAutoUlt);
  const toggleAutoAdvance = useGameStore((s) => s.toggleAutoAdvance);
  const setStage = useGameStore((s) => s.setStage);
  const recordKills = useGameStore((s) => s.recordKills);
  const completeStageVictory = useGameStore((s) => s.completeStageVictory);
  const getPendingIdleRewards = useGameStore((s) => s.getPendingIdleRewards);
  const claimIdleRewards = useGameStore((s) => s.claimIdleRewards);
  const performQuickRaid = useGameStore((s) => s.performQuickRaid);

  const stageDef = useMemo(() => buildStageDefinition(currentStage), [currentStage]);
  const aura = useMemo(() => computeFactionAura(lineup), [lineup]);

  const [allies, setAllies] = useState<BattleUnit[]>([]);
  const [enemies, setEnemies] = useState<BattleUnit[]>([]);
  const [animMap, setAnimMap] = useState<Record<string, RigAnimState>>({});
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const [vfxCmd, setVfxCmd] = useState<VfxBurstCommand | null>(null);
  const [cutIn, setCutIn] = useState<UltCutInData | null>(null);
  const [shaking, setShaking] = useState(false);
  const [astralCharge, setAstralCharge] = useState(65);
  const [waveBanner, setWaveBanner] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const alliesRef = useRef<BattleUnit[]>([]);
  const enemiesRef = useRef<BattleUnit[]>([]);
  const turnStateRef = useRef<TurnEngineState>({ turnQueue: [] });
  const resolvingWaveRef = useRef(false);

  // Sync encounter whenever stage, lineup, ownedHeroes, or relics change
  const rosterSignature = useMemo(() => {
    const parts = lineup.map((id) => {
      if (!id) return 'empty';
      const h = ownedHeroes[id];
      return h ? `${id}:${h.level}:${h.stars}:${Object.values(h.equip).join(',')}` : 'none';
    });
    return `${currentStage}|${parts.join('|')}|${Object.values(relics).join(',')}`;
  }, [currentStage, lineup, ownedHeroes, relics]);

  const spawnEncounter = useCallback(() => {
    const freshStage = buildStageDefinition(currentStage);
    const freshAllies = buildAllyUnits(lineup, ownedHeroes, relics);
    const freshEnemies = freshStage.enemies.map((e) => ({ ...e }));
    alliesRef.current = freshAllies;
    enemiesRef.current = freshEnemies;
    turnStateRef.current = { turnQueue: [] };
    resolvingWaveRef.current = false;
    setAllies(freshAllies.map((u) => ({ ...u })));
    setEnemies(freshEnemies.map((u) => ({ ...u })));
    setAnimMap({});
  }, [currentStage, lineup, ownedHeroes, relics]);

  useEffect(() => {
    spawnEncounter();
  }, [rosterSignature, spawnEncounter]);

  // 1-second timer for live AFK chest ticking
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const pushFloating = useCallback((items: FloatingNumber[]) => {
    setFloats((prev) => [...prev.slice(-14), ...items]);
    window.setTimeout(() => {
      const ids = new Set(items.map((i) => i.id));
      setFloats((prev) => prev.filter((f) => !ids.has(f.id)));
    }, 950);
  }, []);

  const handleWaveOutcome = useCallback(
    (outcome: 'victory' | 'defeat') => {
      if (resolvingWaveRef.current) return;
      resolvingWaveRef.current = true;

      if (outcome === 'victory') {
        playSfx('victory');
        haptic('success');
        const res = completeStageVictory();
        setWaveBanner(
          `ПОБЕДА! +${formatCompactNumber(res.gold)} золота${res.gems > 0 ? ` · +${res.gems} 💎` : ''}`,
        );
        window.setTimeout(() => {
          setWaveBanner(null);
          spawnEncounter();
        }, 900);
      } else {
        setWaveBanner('Отряд перегруппировывается...');
        window.setTimeout(() => {
          setWaveBanner(null);
          spawnEncounter();
        }, 850);
      }
    },
    [completeStageVictory, spawnEncounter],
  );

  const executeSingleStep = useCallback(
    (forceUltUid?: string) => {
      if (resolvingWaveRef.current) return;

      const step = stepBattleTurn(alliesRef.current, enemiesRef.current, turnStateRef.current, {
        autoUlt,
        forceUltUid: forceUltUid ?? null,
      });

      if (!step) {
        const livingEnemies = enemiesRef.current.filter((e) => e.hp > 0);
        handleWaveOutcome(livingEnemies.length === 0 ? 'victory' : 'defeat');
        return;
      }

      const allUnits = [...alliesRef.current, ...enemiesRef.current];
      const actorUnit = allUnits.find((u) => u.uid === step.actorUid);
      const actorPt = actorUnit ? getUnitPoint(actorUnit) : { x: 0.5, y: 0.5 };

      const targetPts: VfxPoint[] = [];
      const newFloats: FloatingNumber[] = [];
      const nextAnims: Record<string, RigAnimState> = {
        [step.actorUid]: step.isUlt ? 'ult' : 'attack',
      };

      let killsThisStep = 0;
      let anyCrit = false;

      for (const imp of step.impacts) {
        const targetUnit = allUnits.find((u) => u.uid === imp.targetUid);
        if (!targetUnit) continue;
        const pt = getUnitPoint(targetUnit);
        targetPts.push(pt);

        if (!imp.isHeal && !imp.isShield) {
          nextAnims[imp.targetUid] = imp.killed ? 'dead' : 'hit';
        }
        if (imp.killed && targetUnit.side === 'enemy') {
          killsThisStep += 1;
        }
        if (imp.isCrit) anyCrit = true;

        floatSeq += 1;
        newFloats.push({
          id: floatSeq,
          x: pt.x * 100 + (Math.random() - 0.5) * 6,
          y: pt.y * 100 - 11,
          text: imp.isHeal
            ? `+${formatCompactNumber(imp.amount)}`
            : imp.isShield
              ? `+Щит ${formatCompactNumber(imp.amount)}`
              : imp.isCrit
                ? `КРИТ ${formatCompactNumber(imp.amount)}!`
                : `-${formatCompactNumber(imp.amount)}`,
          subtext:
            imp.statusApplied === 'freeze'
              ? 'ЗАМОРОЗКА'
              : imp.statusApplied === 'burn'
                ? 'ГОРЕНИЕ'
                : imp.isWeakness
                  ? 'УЯЗВИМОСТЬ!'
                  : undefined,
          kind: imp.isHeal ? 'heal' : imp.isShield ? 'shield' : imp.isCrit ? 'crit' : 'normal',
        });
      }

      if (killsThisStep > 0) {
        recordKills(killsThisStep);
      }

      if (step.isUlt) {
        playSfx('ult');
        haptic('medium');
        setShaking(true);
        window.setTimeout(() => {
          setShaking(false);
        }, 280);
        if (actorUnit?.side === 'ally') {
          vfxSeq += 1;
          setCutIn({
            id: vfxSeq,
            heroName: actorUnit.name,
            skillName: step.skillName,
            visual: actorUnit.visual,
          });
          window.setTimeout(() => {
            setCutIn(null);
          }, 1150);
        }
      } else if (anyCrit) {
        playSfx('crit');
        setShaking(true);
        window.setTimeout(() => {
          setShaking(false);
        }, 220);
      } else if (step.vfx === 'ult_bloom') {
        playSfx('heal');
      } else if (step.vfx.startsWith('proj_')) {
        playSfx('magic');
      } else {
        playSfx('slash');
      }

      vfxSeq += 1;
      setVfxCmd({
        id: vfxSeq,
        kind: step.vfx,
        from: actorPt,
        targets: targetPts.length > 0 ? targetPts : [{ x: 0.5, y: 0.5 }],
      });

      setAstralCharge((prev) => Math.min(100, prev + 11));
      setAnimMap(nextAnims);
      pushFloating(newFloats);
      setAllies(alliesRef.current.map((u) => ({ ...u })));
      setEnemies(enemiesRef.current.map((u) => ({ ...u })));

      window.setTimeout(() => {
        setAnimMap((cur) => {
          const cleaned: Record<string, RigAnimState> = {};
          for (const [k, v] of Object.entries(cur)) {
            if (v === 'dead') cleaned[k] = 'dead';
          }
          return cleaned;
        });
      }, 280);

      if (step.outcome !== 'ongoing') {
        handleWaveOutcome(step.outcome);
      }
    },
    [autoUlt, handleWaveOutcome, pushFloating, recordKills],
  );

  // Main real-time auto-combat loop
  useEffect(() => {
    const intervalMs = battleSpeed === 3 ? 340 : battleSpeed === 2 ? 560 : 880;
    const id = window.setInterval(() => {
      executeSingleStep();
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [battleSpeed, executeSingleStep]);

  const handleCastAstralMeteor = () => {
    if (astralCharge < 100 || resolvingWaveRef.current) return;
    const livingEnemies = enemiesRef.current.filter((e) => e.hp > 0);
    if (livingEnemies.length === 0) return;

    const totalPower = alliesRef.current.reduce(
      (sum, a) => sum + Math.round(a.maxHp * 0.22 + a.atk * 3.1),
      400,
    );
    const impacts = castAstralMeteorStrike(enemiesRef.current, totalPower);
    setAstralCharge(0);
    playSfx('ult');
    haptic('heavy');
    setShaking(true);
    window.setTimeout(() => {
      setShaking(false);
    }, 300);

    const pts: VfxPoint[] = [];
    const floatsBatch: FloatingNumber[] = [];
    let kills = 0;

    for (const imp of impacts) {
      const target = enemiesRef.current.find((e) => e.uid === imp.targetUid);
      if (!target) continue;
      const pt = getUnitPoint(target);
      pts.push(pt);
      if (imp.killed) kills += 1;
      floatSeq += 1;
      floatsBatch.push({
        id: floatSeq,
        x: pt.x * 100,
        y: pt.y * 100 - 12,
        text: `★ ${formatCompactNumber(imp.amount)}!`,
        subtext: 'ГНЕВ АСТРАЛА',
        kind: 'crit',
      });
    }

    if (kills > 0) recordKills(kills);

    vfxSeq += 1;
    setVfxCmd({
      id: vfxSeq,
      kind: 'ult_meteor',
      from: { x: 0.2, y: 0.1 },
      targets: pts,
    });
    pushFloating(floatsBatch);
    setEnemies(enemiesRef.current.map((e) => ({ ...e })));

    if (enemiesRef.current.every((e) => e.hp <= 0)) {
      handleWaveOutcome('victory');
    }
  };

  const handleTapArenaBoost = () => {
    if (astralCharge < 100) {
      playSfx('tap');
      setAstralCharge((c) => Math.min(100, c + 16));
    }
  };

  // Recompute live AFK chest values using `nowTick` and `lastIdleClaimAt`
  const pendingIdle = useMemo(
    () => getPendingIdleRewards(Math.max(nowTick, lastIdleClaimAt)),
    [getPendingIdleRewards, nowTick, lastIdleClaimAt],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-2 px-2.5 py-2 overflow-y-auto custom-scroll">
      {/* Chapter & Stage Header Bar */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-1.5 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            aria-label="Предыдущий этап"
            disabled={currentStage <= 1}
            onClick={() => {
              playSfx('tap');
              setStage(currentStage - 1);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800/90 text-slate-200 disabled:opacity-30 active:scale-90"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                Гл. {stageDef.chapter} · {stageDef.biome.chapterName}
              </span>
              {stageDef.isBossStage && (
                <span className="inline-flex items-center gap-0.5 rounded bg-rose-500/25 px-1.5 py-0.5 text-[9px] font-black text-rose-300 border border-rose-400/40">
                  <Crown className="h-2.5 w-2.5 text-amber-300" />
                  БОСС
                </span>
              )}
            </div>
            <div className="text-xs font-black text-white">
              Этап {stageDef.label}
              {aura.active && (
                <span className="ml-2 text-[10px] font-semibold text-emerald-300">
                  ✦ {aura.name}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="Следующий этап"
            disabled={currentStage >= maxStage}
            onClick={() => {
              playSfx('tap');
              setStage(currentStage + 1);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800/90 text-slate-200 disabled:opacity-30 active:scale-90"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            playSfx('tap');
            toggleAutoAdvance();
          }}
          className={`shrink-0 rounded-xl border px-2.5 py-1 text-[10px] font-extrabold transition active:scale-95 ${
            autoAdvance
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
              : 'border-white/10 bg-slate-800 text-slate-400'
          }`}
        >
          {autoAdvance ? 'Авто-поход: ВКЛ' : 'Фарм этапа'}
        </button>
      </div>

      {/* Main Live Battle Stage */}
      <div
        role="presentation"
        onClick={handleTapArenaBoost}
        style={{
          background: `linear-gradient(180deg, ${stageDef.biome.skyTop} 0%, ${stageDef.biome.skyMid} 54%, ${stageDef.biome.floorColor} 100%)`,
        }}
        className={`relative min-h-[250px] flex-1 overflow-hidden rounded-3xl border border-white/15 shadow-2xl cursor-pointer ${
          shaking ? 'arena-shake' : ''
        }`}
      >
        {/* Atmospheric Horizon Glow & Stone Magic Circle Floor */}
        <svg
          viewBox="0 0 400 260"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-55"
        >
          <defs>
            <radialGradient id="floorGlow" cx="50%" cy="68%" r="52%">
              <stop offset="0%" stopColor={stageDef.biome.accentColor} stopOpacity="0.32" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Distant jagged spires silhouette */}
          <polygon
            points="0,145 35,98 68,132 112,82 152,135 205,112 258,76 298,128 348,88 400,136 400,165 0,165"
            fill="#020617"
            opacity="0.45"
          />
          <rect x="0" y="146" width="400" height="114" fill="url(#floorGlow)" />
          {/* Arcane Arena Floor Circle */}
          <ellipse
            cx="200"
            cy="184"
            rx="145"
            ry="46"
            fill="none"
            stroke={stageDef.biome.accentColor}
            strokeOpacity="0.3"
            strokeWidth="1.5"
            strokeDasharray="8 6"
          />
          <ellipse
            cx="200"
            cy="184"
            rx="96"
            ry="29"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.16"
            strokeWidth="1"
          />
        </svg>

        {/* Ultimate Cut-In Banner */}
        <UltCutIn cutIn={cutIn} />

        {/* Real-Time 60fps Particle & Slash Canvas */}
        <BattleVfxCanvas command={vfxCmd} ambientKind={stageDef.biome.particleKind} />

        {/* Render Allies & Enemies */}
        {[...allies, ...enemies].map((unit) => {
          const pt = getUnitPoint(unit);
          const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
          const shieldPct = Math.max(0, Math.min(100, (unit.shield / unit.maxHp) * 100));
          const enPct = Math.max(0, Math.min(100, unit.energy));
          const rigState: RigAnimState =
            unit.hp <= 0 ? 'dead' : (animMap[unit.uid] ?? 'idle');
          const manualUltReady =
            unit.side === 'ally' && unit.hp > 0 && unit.energy >= 100 && !autoUlt;

          return (
            <div
              key={unit.uid}
              style={{
                left: `${pt.x * 100}%`,
                top: `${pt.y * 100}%`,
                transform: 'translate(-50%, -58%)',
                zIndex: Math.round(pt.y * 20),
              }}
              onClick={(ev) => {
                if (manualUltReady) {
                  ev.stopPropagation();
                  executeSingleStep(unit.uid);
                }
              }}
              className="absolute flex flex-col items-center"
            >
              {/* Manual Ult Prompt Pill */}
              {manualUltReady && (
                <motion.button
                  type="button"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                  className="mb-0.5 rounded-full border border-amber-300 bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[9px] font-black text-slate-950 shadow-lg"
                >
                  УЛЬТА!
                </motion.button>
              )}

              {/* Unit Overhead HP & Energy Bars */}
              {unit.hp > 0 && (
                <div className="mb-0.5 flex flex-col items-center pointer-events-none">
                  <div className="flex items-center gap-1 text-[9px] font-extrabold text-white drop-shadow">
                    {unit.isBoss && <Crown className="h-3 w-3 text-amber-400" />}
                    <span className="rounded bg-black/55 px-1 text-[8px] text-amber-200">
                      Ур.{unit.level}
                    </span>
                  </div>
                  <div className="relative mt-0.5 h-2 w-14 overflow-hidden rounded-full bg-slate-950/90 border border-white/20">
                    <div
                      style={{ width: `${hpPct}%` }}
                      className={`h-full transition-all duration-200 ${
                        unit.side === 'ally'
                          ? 'bg-gradient-to-r from-emerald-500 to-lime-400'
                          : 'bg-gradient-to-r from-rose-600 to-orange-400'
                      }`}
                    />
                    {shieldPct > 0 && (
                      <div
                        style={{ width: `${shieldPct}%` }}
                        className="absolute inset-y-0 left-0 bg-sky-200/75 transition-all duration-150"
                      />
                    )}
                  </div>
                  {/* Energy Bar */}
                  <div className="mt-0.5 h-1 w-12 overflow-hidden rounded-full bg-slate-950/90">
                    <div
                      style={{ width: `${enPct}%` }}
                      className={`h-full transition-all duration-200 ${
                        enPct >= 100 ? 'bg-amber-300' : 'bg-cyan-400'
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Animated Character Rig */}
              <HeroRig
                visual={unit.visual}
                facing={unit.side === 'ally' ? 'right' : 'left'}
                size={unit.isBoss ? 94 : 74}
                stars={unit.stars}
                isBoss={unit.isBoss}
                frozen={unit.frozenTurns > 0}
                burning={unit.burnTurns > 0}
                energyReady={unit.hp > 0 && unit.energy >= 100}
                animState={rigState}
              />
            </div>
          );
        })}

        {/* Floating Damage / Crit / Heal Popups */}
        <AnimatePresence>
          {floats.map((fl) => (
            <motion.div
              key={fl.id}
              initial={{ opacity: 0, y: 8, scale: fl.kind === 'crit' ? 0.65 : 0.85 }}
              animate={{ opacity: 1, y: -24, scale: fl.kind === 'crit' ? 1.18 : 1 }}
              exit={{ opacity: 0, y: -42 }}
              transition={{ duration: 0.72, ease: 'easeOut' }}
              style={{ left: `${fl.x}%`, top: `${fl.y}%` }}
              className="pointer-events-none absolute z-30 -translate-x-1/2 text-center whitespace-nowrap"
            >
              {fl.subtext && (
                <div className="text-[8px] font-black tracking-wider text-amber-300 drop-shadow">
                  {fl.subtext}
                </div>
              )}
              <div
                className={`font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] ${
                  fl.kind === 'crit'
                    ? 'text-sm text-amber-300'
                    : fl.kind === 'heal'
                      ? 'text-xs text-emerald-300'
                      : fl.kind === 'shield'
                        ? 'text-[11px] text-sky-200'
                        : 'text-xs text-white'
                }`}
              >
                {fl.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Wave Result Banner */}
        <AnimatePresence>
          {waveBanner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="pointer-events-none absolute inset-x-6 bottom-4 z-30 rounded-2xl border border-amber-400/50 bg-slate-950/90 py-2 px-3 text-center text-xs font-black text-amber-200 shadow-2xl backdrop-blur-md"
            >
              {waveBanner}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subtle Tap-to-charge hint */}
        <div className="pointer-events-none absolute bottom-1.5 left-3 z-20 text-[9px] font-semibold text-white/50">
          Тап по арене заряжает Звёздный Гнев
        </div>
      </div>

      {/* Combat Action Bar: Astral Meteor Active Skill + Speed + Auto-Ult */}
      <div className="grid grid-cols-12 gap-2 shrink-0">
        <button
          type="button"
          onClick={handleCastAstralMeteor}
          disabled={astralCharge < 100}
          className={`col-span-6 relative overflow-hidden rounded-2xl border px-3 py-2 text-left transition active:scale-95 ${
            astralCharge >= 100
              ? 'btn-gloss border-amber-300 bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 text-white shadow-lg shadow-purple-500/30'
              : 'border-white/10 bg-slate-900/90 text-slate-300'
          }`}
        >
          <div
            style={{ width: `${astralCharge}%` }}
            className="pointer-events-none absolute inset-y-0 left-0 bg-purple-500/20 transition-all duration-200"
          />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Flame className={`h-4 w-4 ${astralCharge >= 100 ? 'text-amber-200 animate-bounce' : 'text-purple-400'}`} />
              <div>
                <div className="text-[11px] font-black leading-tight">Звёздный Гнев</div>
                <div className="text-[9px] font-bold text-white/75">
                  {astralCharge >= 100 ? 'ГОТОВО — ОБРУШИТЬ!' : `Заряд ${astralCharge}%`}
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* Battle Speed x1 / x2 / x3 */}
        <button
          type="button"
          onClick={() => {
            playSfx('tap');
            const nextSpeed = battleSpeed === 1 ? 2 : battleSpeed === 2 ? 3 : 1;
            setBattleSpeed(nextSpeed);
          }}
          className="col-span-3 flex flex-col items-center justify-center rounded-2xl border border-sky-400/30 bg-slate-900/90 px-2 py-1.5 text-sky-200 transition active:scale-95"
        >
          <div className="flex items-center gap-1 text-xs font-black">
            <FastForward className="h-3.5 w-3.5 text-sky-400" />
            <span>x{battleSpeed}</span>
          </div>
          <span className="text-[9px] font-semibold text-slate-400">Скорость</span>
        </button>

        {/* Auto Ultimate Toggle */}
        <button
          type="button"
          onClick={() => {
            playSfx('tap');
            toggleAutoUlt();
          }}
          className={`col-span-3 flex flex-col items-center justify-center rounded-2xl border px-2 py-1.5 transition active:scale-95 ${
            autoUlt
              ? 'border-amber-400/45 bg-amber-500/15 text-amber-200'
              : 'border-white/10 bg-slate-900/90 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-1 text-xs font-black">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>{autoUlt ? 'АВТО' : 'РУЧН'}</span>
          </div>
          <span className="text-[9px] font-semibold opacity-80">Ульта</span>
        </button>
      </div>

      {/* AFK Idle Chest & Instant 2-Hour Quick Raid Card */}
      <div className="shrink-0 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-slate-900/95 via-indigo-950/60 to-slate-900/95 p-2.5 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
              <Gift className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Сундук AFK ({stageDef.idleGoldPerMin}/мин)</span>
              <span className="inline-flex items-center gap-0.5 text-slate-400">
                <Clock className="h-3 w-3" />
                {Math.floor(pendingIdle.seconds / 60)}м {pendingIdle.seconds % 60}с
              </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs font-extrabold">
              <span className="flex items-center gap-1 text-amber-200">
                <Coins className="h-3.5 w-3.5 text-amber-400" />+
                {formatCompactNumber(pendingIdle.gold)}
              </span>
              <span className="flex items-center gap-1 text-emerald-200">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />+
                {formatCompactNumber(pendingIdle.essence)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const claimed = claimIdleRewards();
                if (claimed) {
                  playSfx('coin');
                  haptic('medium');
                }
              }}
              disabled={pendingIdle.gold <= 0 && pendingIdle.essence <= 0}
              className="btn-gloss rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2 text-xs font-black text-slate-950 shadow-md disabled:opacity-40 active:scale-95"
            >
              Забрать
            </button>

            <button
              type="button"
              onClick={() => {
                const res = performQuickRaid();
                if (res) {
                  playSfx('coin');
                  haptic('success');
                }
              }}
              className="rounded-xl border border-fuchsia-400/45 bg-fuchsia-600/25 px-2.5 py-1.5 text-center transition hover:bg-fuchsia-600/35 active:scale-95"
            >
              <div className="text-[10px] font-black leading-tight text-fuchsia-100">
                Набег +2ч
              </div>
              <div className="text-[9px] font-bold text-amber-300">
                {quickRaidsUsed === 0 ? 'БЕСПЛАТНО' : '50 💎'}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
