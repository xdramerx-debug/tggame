import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { fmt, useGameStore } from '../state/gameStore';
import { FACTION_META } from '../game/constants';
import type { BattleEvent, BattleResult, BattleUnitSnapshot, Side } from '../game/types';
import { playSfx } from '../platform/audio';

/**
 * Battle visualization (§3, §7): replays the pure simulation's event log.
 * Damage numbers float & fade, crits are bigger + golden + light screen shake,
 * casts get a glow marker + banner, deaths dissolve, HP bars are thin
 * green→yellow→red gradients. Speed x1/x2/x4, skip for crystals or an ad.
 */

interface UnitView {
  snap: BattleUnitSnapshot;
  hp: number;
  shield: number;
  dead: boolean;
  anim: '' | 'lunge' | 'hit' | 'cast';
  buff: string | null;
}

interface FloatNumber {
  id: number;
  side: Side;
  unit: number;
  text: string;
  cls: string;
}

const EVENT_MS: Record<BattleEvent['t'], number> = {
  round: 420, turn: 60, cast: 950, attack: 340, damage: 300, heal: 360,
  shield: 300, buff: 320, debuff: 320, lifesteal: 240, death: 460, revive: 700, end: 100,
};

let floatSeq = 0;

export function BattleScreen(): ReactElement {
  const battle = useGameStore((s) => s.battle);
  const ftuePause = useGameStore((s) => s.ftuePause);
  const resumeFromFtuePause = useGameStore((s) => s.resumeFromFtuePause);
  const finishBattle = useGameStore((s) => s.finishBattle);
  const setBattleSpeed = useGameStore((s) => s.setBattleSpeed);
  const skipBattle = useGameStore((s) => s.skipBattle);
  const setScreen = useGameStore((s) => s.setScreen);

  const result: BattleResult | null = battle?.result ?? null;
  const speed = battle?.speed ?? 1;

  // «Этап пройден впервые?» — фиксируем до того, как finishBattle сдвинет прогресс
  const firstClear = useMemo(() => {
    if (!battle) return false;
    const g = useGameStore.getState().game;
    if (battle.mode === 'campaign') return battle.stageDef.stage > g.campaign.maxStage;
    if (battle.mode === 'tower') return battle.stageDef.stage > g.tower.bestFloor;
    return true;
  }, [battle]);

  const [cursor, setCursor] = useState(0);
  const [units, setUnits] = useState<Record<Side, UnitView[]>>(emptyUnits);
  const [floats, setFloats] = useState<FloatNumber[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [shaking, setShaking] = useState(false);
  const pausedRef = useRef(false);
  const doneRef = useRef(false);

  // (re)initialize on battle start
  useEffect(() => {
    if (!result) return;
    doneRef.current = false;
    pausedRef.current = false;
    setCursor(0);
    setRound(1);
    setFloats([]);
    setBanner(null);
    setUnits({
      ally: result.allies.map(toView),
      enemy: result.enemies.map(toView),
    });
  }, [result]);

  const pushFloat = useCallback((side: Side, unit: number, text: string, cls: string) => {
    floatSeq += 1;
    const f: FloatNumber = { id: floatSeq, side, unit, text, cls };
    setFloats((prev) => [...prev.slice(-14), f]);
    window.setTimeout(() => { setFloats((prev) => prev.filter((x) => x.id !== f.id)); }, 850);
  }, []);

  const applyEvent = useCallback((ev: BattleEvent): void => {
    switch (ev.t) {
      case 'round':
        setRound(ev.n);
        break;
      case 'turn':
        setUnits((prev) => clearAnims(prev));
        break;
      case 'cast':
        setUnits((prev) => withAnim(prev, ev.side, ev.unit, 'cast'));
        setBanner(ev.skill);
        playSfx('cast');
        window.setTimeout(() => { setBanner(null); }, 900);
        break;
      case 'attack':
        setUnits((prev) => withAnim(prev, ev.side, ev.unit, 'lunge'));
        playSfx('attack');
        break;
      case 'damage': {
        setUnits((prev) => {
          const next = { ...prev };
          const list = [...next[ev.targetSide]];
          const u = list[ev.target];
          if (u) {
            list[ev.target] = { ...u, hp: Math.max(0, u.hp - ev.amount), anim: 'hit' };
            next[ev.targetSide] = list;
          }
          return withAnim(next, ev.side, ev.unit, 'lunge');
        });
        pushFloat(ev.targetSide, ev.target, `-${ev.amount}`, ev.crit ? 'dmg-number crit' : 'dmg-number');
        if (ev.crit) {
          playSfx('crit');
          setShaking(true);
          window.setTimeout(() => { setShaking(false); }, 240);
        } else {
          playSfx('attack');
        }
        break;
      }
      case 'heal':
        setUnits((prev) => adjustHp(prev, ev.side, ev.unit, ev.amount));
        pushFloat(ev.side, ev.unit, `+${ev.amount}`, 'dmg-number heal');
        playSfx('heal');
        break;
      case 'shield':
        setUnits((prev) => adjustShield(prev, ev.side, ev.unit, ev.amount));
        pushFloat(ev.side, ev.unit, `🛡${ev.amount}`, 'dmg-number shield-num');
        break;
      case 'lifesteal':
        setUnits((prev) => adjustHp(prev, ev.side, ev.unit, ev.amount));
        pushFloat(ev.side, ev.unit, `+${ev.amount}`, 'dmg-number heal small-num');
        break;
      case 'buff':
        setUnits((prev) => setBuff(prev, ev.side, ev.unit, '⚔️'));
        pushFloat(ev.side, ev.unit, ev.text, 'dmg-number heal small-num');
        break;
      case 'debuff':
        setUnits((prev) => setBuff(prev, ev.side, ev.unit, '💢'));
        pushFloat(ev.side, ev.unit, ev.text, 'dmg-number small-num');
        break;
      case 'death':
        setUnits((prev) => killUnit(prev, ev.side, ev.unit));
        playSfx('death');
        break;
      case 'revive':
        setUnits((prev) => reviveUnit(prev, ev.side, ev.unit, ev.hp));
        pushFloat(ev.side, ev.unit, 'ВОСКРЕШЕН!', 'dmg-number heal');
        playSfx('heal');
        break;
      case 'end':
        break;
    }
  }, [pushFloat]);

  // playback loop
  useEffect(() => {
    if (!result || !battle || battle.finished) return;
    if (cursor >= result.events.length) return;
    // FTUE-пауза снимается кнопкой «Понятно, дальше!» — продолжаем проигрывание
    if (!ftuePause) pausedRef.current = false;
    if (pausedRef.current) return;

    const ev = result.events[cursor];
    if (!ev) return;

    // FTUE: пауза на первом ударе — игрок видит цифру урона и полоску HP (§1, §9)
    if (ftuePause && ev.t === 'damage' && cursor > 0) {
      pausedRef.current = true;
      applyEvent(ev);
      setCursor(cursor + 1);
      return;
    }

    applyEvent(ev);
    const isLast = cursor + 1 >= result.events.length;
    const delay = EVENT_MS[ev.t] / speed;
    const timer = window.setTimeout(() => {
      if (isLast) {
        if (!doneRef.current) {
          doneRef.current = true;
          finishBattle();
        }
      } else {
        setCursor(cursor + 1);
      }
    }, delay);
    return () => { window.clearTimeout(timer); };
  }, [cursor, result, battle, speed, ftuePause, applyEvent, finishBattle]);

  const rewards = battle?.granted ?? null;
  const finished = battle?.finished === true;
  const victory = result?.victory === true;

  const enemyRows = useMemo(() => splitRows(units.enemy), [units.enemy]);
  const allyRows = useMemo(() => splitRows(units.ally), [units.ally]);

  if (!result || !battle) {
    return (
      <div className="col" style={{ alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="muted">Бой не найден</div>
        <button className="btn" onClick={() => { setScreen('home'); }}>Домой</button>
      </div>
    );
  }

  return (
    <div className="col" style={{ height: '100%', position: 'relative' }}>
      {/* header */}
      <div className="row-between" style={{ padding: '8px 12px 0' }}>
        <div className="small" style={{ fontWeight: 800 }}>{battle.stageDef.name}</div>
        <div className="row" style={{ gap: 4 }}>
          <div className="speed-toggle">
            {[1, 2, 4].map((s) => (
              <button key={s} className={`btn ${speed === s ? 'on' : ''}`} onClick={() => { setBattleSpeed(s); }}>x{s}</button>
            ))}
          </div>
          {!finished ? (
            <button className="btn btn-sm" onClick={() => { skipBattle('ad'); }} title="Пропустить за рекламу">⏭ Реклама</button>
          ) : null}
          {!finished ? (
            <button className="btn btn-sm" onClick={() => { skipBattle('crystals'); }} title="Пропустить за 10 💎">⏭ 10💎</button>
          ) : null}
        </div>
      </div>

      <div className={`battle-arena ${shaking ? 'shake' : ''}`}>
        {/* enemies: back row (2..5) top, front row (0..1) bottom */}
        <div className="team-side">
          <div className="team-row">
            {enemyRows.back.map((u) => u && <Unit key={`e${u.snap.index}`} view={u} floats={floatsFor(floats, 'enemy', u.snap.index)} />)}
          </div>
          <div className="team-row">
            {enemyRows.front.map((u) => u && <Unit key={`e${u.snap.index}`} view={u} wide floats={floatsFor(floats, 'enemy', u.snap.index)} />)}
          </div>
        </div>

        <div className="round-pill">РАУНД {round}</div>
        {banner ? <div className="cast-banner">✦ {banner} ✦</div> : null}

        {/* allies: front row (0..1) top, back row (2..5) bottom */}
        <div className="team-side">
          <div className="team-row">
            {allyRows.front.map((u) => u && <Unit key={`a${u.snap.index}`} view={u} wide floats={floatsFor(floats, 'ally', u.snap.index)} />)}
          </div>
          <div className="team-row">
            {allyRows.back.map((u) => u && <Unit key={`a${u.snap.index}`} view={u} floats={floatsFor(floats, 'ally', u.snap.index)} />)}
          </div>
        </div>
      </div>

      {/* FTUE pause on first hit */}
      {ftuePause && pausedRef.current && !finished ? (
        <div className="ftue-hint">
          Твой герой атакует — смотри на цифры урона и полоску HP!
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-cta pulse-cta" onClick={resumeFromFtuePause}>Понятно, дальше!</button>
          </div>
        </div>
      ) : null}

      {/* victory panel */}
      {finished && victory ? (
        <div className="modal-backdrop" style={{ background: 'rgba(3,6,18,0.55)' }}>
          <div className="modal-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>🏆</div>
            <div className="title-lg" style={{ color: 'var(--gold)' }}>Победа!</div>
            <div className="small" style={{ margin: '6px 0 10px' }}>
              {firstClear ? 'Первое прохождение — полная награда!' : `Раундов: ${result.rounds} · награда за повтор`}
            </div>
            {rewards ? (
              <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                {rewards.gold ? <span className="res-chip">🪙 +{fmt(rewards.gold)}</span> : null}
                {rewards.heroExp ? <span className="res-chip">📘 +{fmt(rewards.heroExp)}</span> : null}
                {rewards.shards ? <span className="res-chip">🔷 +{rewards.shards}</span> : null}
                {rewards.crystals ? <span className="res-chip">💎 +{rewards.crystals}</span> : null}
                {rewards.souls ? <span className="res-chip">🔮 +{rewards.souls}</span> : null}
                {rewards.heroDefId ? <span className="res-chip">🦸 новый герой</span> : null}
              </div>
            ) : null}
            <div className="col">
              <button className="btn btn-cta" onClick={() => { advanceFtue(); setScreen('home'); retry(battle.mode); }}>Следующий бой</button>
              <button className="btn" onClick={() => { advanceFtue(); setScreen('home'); }}>К обзору</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  function retry(mode: 'campaign' | 'tower' | 'labyrinth'): void {
    window.setTimeout(() => { useGameStore.getState().startBattle(mode); }, 60);
  }

  function advanceFtue(): void {
    const st = useGameStore.getState();
    const step = st.game.ftue.step;
    if (!st.game.ftue.done && (step === 1 || step === 3)) st.ftueAdvance();
  }
}

/* --------------------------------- helpers --------------------------------- */

function emptyUnits(): Record<Side, UnitView[]> {
  return { ally: [], enemy: [] };
}

function toView(snap: BattleUnitSnapshot): UnitView {
  return { snap, hp: snap.maxHp, shield: 0, dead: false, anim: '', buff: null };
}

function splitRows(list: UnitView[]): { front: (UnitView | null)[]; back: (UnitView | null)[] } {
  const front: (UnitView | null)[] = [null, null];
  const back: (UnitView | null)[] = [null, null, null, null];
  for (const u of list) {
    if (u.snap.index < 2) front[u.snap.index] = u;
    else back[u.snap.index - 2] = u;
  }
  return { front, back };
}

function withAnim(prev: Record<Side, UnitView[]>, side: Side, idx: number, anim: UnitView['anim']): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, anim };
  return { ...prev, [side]: list };
}

function clearAnims(prev: Record<Side, UnitView[]>): Record<Side, UnitView[]> {
  return {
    ally: prev.ally.map((u) => ({ ...u, anim: '' })),
    enemy: prev.enemy.map((u) => ({ ...u, anim: '' })),
  };
}

function adjustHp(prev: Record<Side, UnitView[]>, side: Side, idx: number, amount: number): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, hp: Math.min(u.snap.maxHp, u.hp + amount) };
  return { ...prev, [side]: list };
}

function adjustShield(prev: Record<Side, UnitView[]>, side: Side, idx: number, amount: number): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, shield: u.shield + amount };
  return { ...prev, [side]: list };
}

function setBuff(prev: Record<Side, UnitView[]>, side: Side, idx: number, buff: string): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, buff };
  return { ...prev, [side]: list };
}

function killUnit(prev: Record<Side, UnitView[]>, side: Side, idx: number): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, dead: true, hp: 0, anim: '' };
  return { ...prev, [side]: list };
}

function reviveUnit(prev: Record<Side, UnitView[]>, side: Side, idx: number, hp: number): Record<Side, UnitView[]> {
  const list = [...prev[side]];
  const u = list[idx];
  if (u) list[idx] = { ...u, dead: false, hp };
  return { ...prev, [side]: list };
}

function floatsFor(floats: FloatNumber[], side: Side, unit: number): FloatNumber[] {
  return floats.filter((f) => f.side === side && f.unit === unit);
}

function Unit({ view, floats, wide }: { view: UnitView; floats: FloatNumber[]; wide?: boolean }): ReactElement {
  const { snap } = view;
  const meta = FACTION_META[snap.faction];
  const hpPct = snap.maxHp > 0 ? view.hp / snap.maxHp : 0;
  const animCls = view.anim === 'lunge' ? (snap.side === 'ally' ? 'lunge-ally' : 'lunge-enemy') : view.anim === 'hit' ? 'hit' : view.anim === 'cast' ? 'casting' : '';
  return (
    <div className={`unit ${wide ? 'wide-slot' : ''} ${view.dead ? 'dead' : ''} ${animCls} ${snap.isBoss ? 'boss' : ''}`}>
      <div className="unit-avatar" style={{ borderColor: meta.color }}>
        {snap.emoji}
        {view.shield > 0 ? <span className="shield-pip">🛡</span> : null}
        {view.buff ? <span className="buff-pip">{view.buff}</span> : null}
      </div>
      <div className="unit-hp">
        <Bar hpPct={hpPct} />
      </div>
      <div className="unit-name">{snap.name}</div>
      {floats.map((f) => (
        <span key={f.id} className={f.cls}>{f.text}</span>
      ))}
    </div>
  );
}

function Bar({ hpPct }: { hpPct: number }): ReactElement {
  return (
    <div className="hp-bar">
      <div
        className="hp-fill"
        style={{
          width: `${Math.max(0, Math.min(100, hpPct * 100))}%`,
          background: hpPct > 0.55 ? '#22c55e' : hpPct > 0.25 ? '#eab308' : '#ef4444',
        }}
      />
    </div>
  );
}
