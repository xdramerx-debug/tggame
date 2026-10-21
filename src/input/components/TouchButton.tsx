import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { ACTION_SPECS, CooldownTracker } from '../actions';
import type { InputAction } from '../types';
import { hapticImpact } from '@/telegram/haptic';

interface TouchButtonProps {
  readonly action: InputAction;
  /** Final size in CSS px (spec size × S/M/L setting). */
  readonly size: number;
  readonly onPress: (action: InputAction) => boolean | void;
  readonly disabled?: boolean;
  /** Shown as a small label under the icon (e.g. interaction verb). */
  readonly hint?: string;
  readonly testId?: string;
}

/**
 * HUD action button.
 *
 * - Fires on `pointerdown` (≤50 ms perceived response, no click delay).
 * - Press feedback: scale 0.92 with a 120 ms spring.
 * - Cooldown: conic-gradient sweep driven by rAF writing a CSS variable, so the
 *   countdown never re-renders React.
 * - Pointer capture keeps the gesture inside the button even if the thumb slides.
 */
export function TouchButton({
  action,
  size,
  onPress,
  disabled = false,
  hint,
  testId,
}: TouchButtonProps): ReactElement {
  const spec = ACTION_SPECS[action];
  const cooldown = useRef(new CooldownTracker());
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [cooling, setCooling] = useState(false);
  const cooldownMs = spec.cooldownMs;
  const fontSize = Math.round(size * 0.42);

  const stopLoop = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // rAF loop kept in a ref so it can re-schedule itself without referencing a
  // function that is still being declared (also keeps the closure stable).
  const loopRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    loopRef.current = (): void => {
      const fraction = cooldown.current.remainingFraction(action, performance.now());
      const overlay = overlayRef.current;
      if (overlay) overlay.style.setProperty('--cd-deg', `${Math.round((1 - fraction) * 360)}deg`);
      if (fraction <= 0) {
        stopLoop();
        setCooling(false);
        return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, [action, stopLoop]);

  const startCooldownLoop = useCallback((): void => {
    stopLoop();
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, [stopLoop]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      event.preventDefault();
      if (disabled) return;
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers (tests) and edge-case WebViews may reject capture.
      }
      const now = performance.now();
      // Cooldown gates the action itself, not just its visuals.
      if (!cooldown.current.isReady(action, now)) return;
      const fired = onPress(action);
      if (fired === false) return;
      cooldown.current.press(action, now, cooldownMs);
      hapticImpact(action === 'attack' ? 'medium' : 'light');
      setCooling(true);
      startCooldownLoop();
    },
    [action, cooldownMs, disabled, onPress, startCooldownLoop],
  );

  useEffect(() => stopLoop, [stopLoop]);

  return (
    <motion.button
      type="button"
      className="hud-panel relative flex select-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        opacity: disabled ? 0.4 : 1,
        background: 'radial-gradient(circle at 50% 35%, rgba(30,42,58,0.92), rgba(0,0,0,0.72))',
        borderColor: cooling ? 'rgba(201,162,39,0.35)' : 'rgba(201,162,39,0.75)',
      }}
      aria-label={spec.label}
      aria-disabled={disabled}
      data-testid={testId ?? `action-${action}`}
      data-cooling={cooling ? 'true' : 'false'}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.5 }}
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span aria-hidden="true" style={{ fontSize, lineHeight: 1 }}>
        {spec.icon}
      </span>
      {hint ? (
        <span className="pointer-events-none absolute -bottom-4 w-[120%] truncate text-center text-[10px] uppercase tracking-wider text-gold">
          {hint}
        </span>
      ) : null}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          // 360deg = fully cooled; the dark sector shrinks as the action recovers.
          background: 'conic-gradient(from 0deg, rgba(2,4,8,0.78) var(--cd-deg, 0deg), transparent 0deg)',
        }}
      />
    </motion.button>
  );
}
