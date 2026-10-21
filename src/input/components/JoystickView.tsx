import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { JoystickSnapshot } from '../joystick';

interface JoystickViewProps {
  /** Reads the live state; the view polls it with rAF while a gesture is active. */
  readonly getSnapshot: () => JoystickSnapshot;
  readonly radius: number;
  readonly knobRadius: number;
}

/**
 * Visual layer of the virtual stick.
 *
 * Positions are written straight to the DOM (`style.transform`) inside a rAF
 * loop — no React state per frame, which keeps the main thread free for the
 * render loop. React only re-renders when the stick becomes active/inactive.
 */
export function JoystickView({ getSnapshot, radius, knobRadius }: JoystickViewProps): ReactElement {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const paint = (): void => {
      const snapshot = getSnapshot();
      if (snapshot.active !== active) setActive(snapshot.active);
      const base = baseRef.current;
      const knob = knobRef.current;
      if (base) {
        base.style.transform = `translate3d(${snapshot.base.x - radius}px, ${snapshot.base.y - radius}px, 0)`;
        base.style.opacity = snapshot.active ? '1' : '0.45';
      }
      if (knob) {
        knob.style.transform = `translate3d(${snapshot.knob.x - knobRadius}px, ${snapshot.knob.y - knobRadius}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(paint);
    };
    rafRef.current = requestAnimationFrame(paint);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, getSnapshot, knobRadius, radius]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10" aria-hidden="true" data-testid="joystick-view">
      <div
        ref={baseRef}
        className="absolute rounded-full border-2 will-change-transform"
        style={{
          width: radius * 2,
          height: radius * 2,
          borderColor: 'rgba(201,162,39,0.55)',
          background: 'radial-gradient(circle, rgba(30,42,58,0.55) 0%, rgba(0,0,0,0.35) 70%)',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.6)',
          transition: 'opacity 150ms ease-out',
        }}
      />
      <div
        ref={knobRef}
        className="absolute rounded-full border-2 will-change-transform"
        style={{
          width: knobRadius * 2,
          height: knobRadius * 2,
          borderColor: active ? '#c9a227' : 'rgba(201,162,39,0.7)',
          background: 'radial-gradient(circle at 40% 35%, rgba(201,162,39,0.55), rgba(11,14,20,0.95))',
          boxShadow: '0 2px 10px rgba(0,0,0,0.8)',
          // The spring-return animation is CSS here; physics lives in the model.
          transition: active ? 'none' : 'transform 150ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      />
    </div>
  );
}
