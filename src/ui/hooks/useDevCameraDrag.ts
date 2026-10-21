import { useEffect, useRef } from 'react';
import { gameHost } from '@/game/GameHost';

/**
 * Development-only camera drag.
 *
 * The production input layer (virtual joystick, swipe zones, multitouch) is
 * stage 2 and lives in `src/input/`. This hook exists so the orbit camera can be
 * validated in a browser preview while stage 2 is not implemented yet; it is
 * tree-shaken out of production builds and never touches gameplay state.
 */
export function useDevCameraDrag(enabled: boolean): void {
  const lastPoint = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled || !import.meta.env.DEV) return;
    const target = document.getElementById('game-canvas');
    if (!target) return;

    const onDown = (event: PointerEvent): void => {
      if (lastPoint.current) return;
      lastPoint.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      target.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent): void => {
      const point = lastPoint.current;
      if (!point || point.id !== event.pointerId) return;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
      point.x = event.clientX;
      point.y = event.clientY;
      gameHost.rotateCamera(dx, dy);
    };
    const onUp = (event: PointerEvent): void => {
      if (lastPoint.current?.id !== event.pointerId) return;
      lastPoint.current = null;
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };

    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    // Wheel is desktop-only debug convenience, guarded by DEV.
    const onWheel = (event: WheelEvent): void => {
      gameHost.zoomCamera(event.deltaY > 0 ? 1.06 : 0.94);
    };
    target.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('wheel', onWheel);
      lastPoint.current = null;
    };
  }, [enabled]);
}
