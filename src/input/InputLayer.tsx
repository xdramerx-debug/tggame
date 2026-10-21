import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { useSettingsStore, buttonScaleFactor } from '@/store/useSettingsStore';
import { ACTION_SPECS } from './actions';
import { CameraSwipe, pinchScale, pointerDistance } from './cameraSwipe';
import { DEFAULT_JOYSTICK_OPTIONS, VirtualJoystick } from './joystick';
import { JoystickView } from './components/JoystickView';
import { TouchButton } from './components/TouchButton';
import { ZERO_MOVE } from './types';
import type { InputAction, InteractionHint, Vec2 } from './types';
import { hapticImpact } from '@/telegram/haptic';

interface InputLayerProps {
  /** Interaction offer polled by the parent (~6 Hz). */
  readonly interactionHint: InteractionHint | null;
}

interface PinchState {
  readonly ids: readonly [number, number];
  distance: number;
}

const STICK_ANCHOR_MARGIN = 110;

/**
 * Touch input surface: virtual stick, camera swipe/pinch zone and action cluster.
 *
 * Multi-touch is guaranteed by construction: every pointer is captured by the
 * element it started on, and gestures are keyed by `pointerId`, so moving,
 * rotating the camera and attacking can happen on three fingers at once.
 *
 * Layout follows the handedness setting (HUD and zones mirror together).
 */
export function InputLayer({ interactionHint }: InputLayerProps): ReactElement {
  const handedness = useSettingsStore((state) => state.handedness);
  const buttonScale = useSettingsStore((state) => state.buttonScale);
  const autoAttack = useSettingsStore((state) => state.autoAttack);

  const joystick = useRef(new VirtualJoystick());
  const swipe = useRef(new CameraSwipe());
  const cameraPointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<PinchState | null>(null);
  const inertiaRaf = useRef<number | null>(null);

  const stickOnLeft = handedness === 'right';
  const scale = buttonScaleFactor(buttonScale);
  const attackSize = Math.round(ACTION_SPECS.attack.size * scale);
  const skillSize = Math.round(ACTION_SPECS.skill1.size * scale);
  const dodgeSize = Math.round(ACTION_SPECS.dodge.size * scale);
  const interactSize = Math.round(ACTION_SPECS.interact.size * scale);

  const readSafeInset = useCallback((side: 'left' | 'right' | 'bottom'): number => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const computeAnchor = useCallback((): Vec2 => {
    const left = readSafeInset('left');
    const right = readSafeInset('right');
    const bottom = readSafeInset('bottom');
    return {
      x: stickOnLeft ? left + STICK_ANCHOR_MARGIN : window.innerWidth - right - STICK_ANCHOR_MARGIN,
      y: window.innerHeight - bottom - STICK_ANCHOR_MARGIN,
    };
  }, [readSafeInset, stickOnLeft]);

  // Keep the stick anchored to its HUD corner across rotations and inset changes.
  useEffect(() => {
    const update = (): void => joystick.current.setAnchor(computeAnchor());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [computeAnchor]);

  const readJoystickSnapshot = useCallback(() => joystick.current.snapshot(), []);

  const pushMove = useCallback((): void => {
    const { value } = joystick.current.snapshot();
    gameHost.setMoveInput(value.magnitude > 0 ? value : ZERO_MOVE);
  }, []);

  const capture = (event: ReactPointerEvent<HTMLElement>): void => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers / older WebViews cannot capture — gestures still work.
    }
  };

  const startInertia = useCallback((): void => {
    if (inertiaRaf.current !== null) return;
    let last = performance.now();
    const step = (): void => {
      const now = performance.now();
      const dt = Math.min(64, now - last);
      last = now;
      const delta = swipe.current.applyInertia(dt);
      if (delta.dx !== 0 || delta.dy !== 0) gameHost.rotateCamera(delta.dx, delta.dy);
      if (swipe.current.isGliding) {
        inertiaRaf.current = requestAnimationFrame(step);
      } else {
        inertiaRaf.current = null;
      }
    };
    inertiaRaf.current = requestAnimationFrame(step);
  }, []);

  // ---------------------------------------------------------------- stick ---

  const onStickDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (joystick.current.isActive) return;
    capture(event);
    joystick.current.setAnchor(computeAnchor());
    joystick.current.begin(event.pointerId, { x: event.clientX, y: event.clientY });
    pushMove();
  };

  const onStickMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (joystick.current.activePointerId !== event.pointerId) return;
    joystick.current.move({ x: event.clientX, y: event.clientY });
    pushMove();
  };

  const onStickEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (joystick.current.activePointerId !== event.pointerId) return;
    joystick.current.end(event.pointerId);
    gameHost.setMoveInput(ZERO_MOVE);
  };

  // --------------------------------------------------------------- camera ---

  const onCameraDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    capture(event);
    cameraPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (cameraPointers.current.size === 1) {
      swipe.current.begin(event.pointerId, { x: event.clientX, y: event.clientY }, performance.now());
      return;
    }
    if (cameraPointers.current.size === 2) {
      swipe.current.cancel();
      const entries = [...cameraPointers.current.entries()];
      const first = entries[0];
      const second = entries[1];
      if (first && second) {
        pinch.current = {
          ids: [first[0], second[0]],
          distance: pointerDistance(first[1], second[1]),
        };
      }
    }
  };

  const onCameraMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!cameraPointers.current.has(event.pointerId)) return;
    cameraPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinchState = pinch.current;
    if (pinchState && cameraPointers.current.size >= 2) {
      const points = [...cameraPointers.current.values()];
      const a = points[0];
      const b = points[1];
      if (a && b) {
        const distance = pointerDistance(a, b);
        const factor = pinchScale(pinchState.distance, distance);
        if (factor !== 1) gameHost.zoomCamera(factor);
        pinchState.distance = distance;
      }
      return;
    }

    if (swipe.current.activePointerId !== event.pointerId) return;
    const delta = swipe.current.move({ x: event.clientX, y: event.clientY }, performance.now());
    if (delta.dx !== 0 || delta.dy !== 0) gameHost.rotateCamera(delta.dx, delta.dy);
  };

  const onCameraUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    cameraPointers.current.delete(event.pointerId);

    if (pinch.current) {
      if (cameraPointers.current.size < 2) pinch.current = null;
      return;
    }
    if (swipe.current.activePointerId !== event.pointerId) return;

    const result = swipe.current.end(performance.now());
    if (result.tap) {
      // Spec: a tap on the camera area is a quick attack in the current direction.
      if (autoAttack) {
        gameHost.triggerAction('attack');
        hapticImpact('light');
      }
      return;
    }
    if (Math.hypot(result.velocity.x, result.velocity.y) > 0.05) startInertia();
  };

  const onCameraCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    cameraPointers.current.delete(event.pointerId);
    swipe.current.cancel();
    pinch.current = null;
    if (inertiaRaf.current !== null) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = null;
    }
  };

  // -------------------------------------------------------------- actions ---

  const handleAction = useCallback((action: InputAction): boolean => {
    gameHost.triggerAction(action);
    return true;
  }, []);

  // Reset every gesture when the app loses focus or the layer unmounts.
  useEffect(() => {
    const reset = (): void => {
      joystick.current.cancel();
      swipe.current.cancel();
      cameraPointers.current.clear();
      pinch.current = null;
      if (inertiaRaf.current !== null) {
        cancelAnimationFrame(inertiaRaf.current);
        inertiaRaf.current = null;
      }
      gameHost.setMoveInput(ZERO_MOVE);
    };
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, []);

  const hudOpacity = 'var(--hud-opacity)';
  const stickSide = stickOnLeft ? 'left-0' : 'right-0';
  const cameraSide = stickOnLeft ? 'right-0' : 'left-0';

  return (
    <>
      {/* Invisible camera area: half the screen opposite the stick. */}
      <div
        className={`absolute inset-y-0 z-0 w-1/2 touch-none ${cameraSide}`}
        style={{ pointerEvents: 'auto' }}
        data-testid="camera-zone"
        onPointerDown={onCameraDown}
        onPointerMove={onCameraMove}
        onPointerUp={onCameraUp}
        onPointerCancel={onCameraCancel}
        aria-hidden="true"
      />

      {/* Stick area: bottom half on the stick side, above the camera zone. */}
      <div
        className={`absolute bottom-0 z-10 h-[66%] w-1/2 touch-none ${stickSide}`}
        style={{ pointerEvents: 'auto' }}
        data-testid="stick-zone"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickEnd}
        onPointerCancel={onStickEnd}
        aria-hidden="true"
      />

      <JoystickView
        getSnapshot={readJoystickSnapshot}
        radius={DEFAULT_JOYSTICK_OPTIONS.radius}
        knobRadius={DEFAULT_JOYSTICK_OPTIONS.knobRadius}
      />

      {/* Action cluster, mirrored with handedness. */}
      <div
        className={`absolute z-20 flex flex-col items-end gap-3 ${
          stickOnLeft ? 'right-0' : 'left-0'
        }`}
        style={{
          opacity: hudOpacity,
          bottom: `calc(var(--safe-bottom) + 20px)`,
          ...(stickOnLeft
            ? { right: 'calc(var(--safe-right) + 20px)' }
            : { left: 'calc(var(--safe-left) + 20px)' }),
        }}
      >
        <div className={`flex items-end gap-3 ${stickOnLeft ? '' : 'flex-row-reverse'}`}>
          <div
            style={{
              width: interactSize,
              height: interactSize,
              opacity: interactionHint?.available ? 1 : 0,
              transform: `scale(${interactionHint?.available ? 1 : 0.85})`,
              transition: 'opacity 150ms ease-out, transform 150ms ease-out',
              pointerEvents: interactionHint?.available ? 'auto' : 'none',
            }}
            aria-hidden={!interactionHint?.available}
          >
            <TouchButton
              action="interact"
              size={interactSize}
              onPress={handleAction}
              disabled={!interactionHint?.available}
              hint={interactionHint?.available ? interactionHint.label : undefined}
            />
          </div>
          <TouchButton action="skill1" size={skillSize} onPress={handleAction} />
          <TouchButton action="skill2" size={skillSize} onPress={handleAction} />
        </div>
        <div className={`flex items-end gap-3 ${stickOnLeft ? '' : 'flex-row-reverse'}`}>
          <TouchButton action="dodge" size={dodgeSize} onPress={handleAction} />
          <TouchButton action="attack" size={attackSize} onPress={handleAction} />
        </div>
      </div>
    </>
  );
}
