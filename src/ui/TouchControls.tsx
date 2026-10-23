import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ActionButton, InputController } from '@/input/controls';
import type { BattleSnapshot } from '@/fight/types';

const STICK_RADIUS = 36;

interface StickProps {
  readonly controls: InputController;
}

function Stick({ controls }: StickProps): ReactElement {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const updateFrom = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const limit = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    setKnob({ x: Math.cos(angle) * limit * STICK_RADIUS, y: Math.sin(angle) * limit * STICK_RADIUS });
    controls.setStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
  };

  const end = (): void => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    controls.setStick(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(event) => {
        if (pointerId.current !== null) return;
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFrom(event);
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        updateFrom(event);
      }}
      onPointerUp={(event) => {
        if (pointerId.current === event.pointerId) end();
      }}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className="pointer-events-auto relative h-[128px] w-[128px] touch-none rounded-full border border-bone/20 bg-black/45 shadow-[inset_0_0_24px_rgba(0,0,0,0.8)] backdrop-blur-[2px]"
      aria-label="Движение"
      role="group"
    >
      <span className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-bone/35" />
      <span className="absolute bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-bone/35" />
      <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-bone/35" />
      <span className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-bone/35" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[56px] w-[56px] rounded-full border border-bone/40 bg-gradient-to-b from-bone/25 to-bone/5 shadow-[0_4px_14px_rgba(0,0,0,0.6)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-[10px] uppercase tracking-[0.3em] text-bone/25">
        ход
      </span>
    </div>
  );
}

interface TouchButtonProps {
  readonly controls: InputController;
  readonly action: ActionButton;
  readonly label: string;
  readonly hint?: string;
  readonly tone?: 'bone' | 'ember' | 'acid' | 'blood' | 'steel';
  readonly disabled?: boolean;
}

const TONES: Readonly<Record<NonNullable<TouchButtonProps['tone']>, string>> = {
  bone: 'border-bone/40 text-bone from-bone/15',
  ember: 'border-ember/60 text-ember from-ember/20',
  acid: 'border-acid/60 text-acid from-acid/20',
  blood: 'border-blood/70 text-blood from-blood/25',
  steel: 'border-bone/25 text-bone/75 from-bone/10',
};

function TouchButton({ controls, action, label, hint, tone = 'bone', disabled = false }: TouchButtonProps): ReactElement {
  const [pressed, setPressed] = useState(false);

  const press = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPressed(true);
    controls.setButton(action, true);
  };

  const release = (): void => {
    setPressed(false);
    controls.setButton(action, false);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => { event.preventDefault(); }}
      className={`pointer-events-auto flex h-[66px] w-[66px] touch-none select-none flex-col items-center justify-center rounded-full border-2 bg-gradient-to-b to-black/70 font-display uppercase leading-none shadow-[0_3px_0_rgba(0,0,0,0.6)] transition-transform duration-75 ${
        TONES[tone]
      } ${pressed ? 'translate-y-[2px] scale-95 brightness-150' : ''} ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="text-[13px] tracking-wide">{label}</span>
      {hint && <span className="mt-[2px] text-[9px] tracking-[0.16em] opacity-60">{hint}</span>}
    </button>
  );
}

interface TouchControlsProps {
  readonly controls: InputController;
  readonly snapshot: BattleSnapshot | null;
}

/** Landscape thumb layout: left stick + block, right four-button attack cluster. */
export function TouchControls({ controls, snapshot }: TouchControlsProps): ReactElement {
  const meter = snapshot?.fighters[0].meter ?? 0;
  const specialReady = meter >= 100;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute bottom-[max(10px,env(safe-area-inset-bottom))] left-[max(10px,env(safe-area-inset-left))] flex items-end gap-4">
        <Stick controls={controls} />
        <TouchButton controls={controls} action="block" label="блок" hint="держать" tone="steel" />
      </div>

      <div className="absolute bottom-[max(10px,env(safe-area-inset-bottom))] right-[max(10px,env(safe-area-inset-right))]">
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-end gap-3">
            <TouchButton controls={controls} action="special" label="спешл" hint={specialReady ? '1 полоса' : 'нет метра'} tone="ember" />
            <TouchButton controls={controls} action="kick" label="пинок" tone="bone" />
          </div>
          <div className="flex items-end gap-3">
            <TouchButton controls={controls} action="super" label="супер" hint="3 полосы" tone="acid" disabled={meter < 300} />
            <TouchButton controls={controls} action="punch" label="удар" tone="blood" />
          </div>
        </div>
      </div>
    </div>
  );
}
