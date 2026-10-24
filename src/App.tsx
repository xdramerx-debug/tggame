import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { Game } from './engine/game';
import { useUi } from './state/store';
import { Hud } from './ui/Hud';
import { Menus } from './ui/Menus';
import { TouchControls } from './ui/TouchControls';
import { unlockAudio } from './engine/audio';

export function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!canvas || !left || !right) return;

    let game: Game | null = null;
    try {
      game = new Game(canvas, {
        onSnapshot: (s) => { useUi.getState().applySnapshot(s); },
        onEvent: (e) => { useUi.getState().applyEvent(e); },
      });
      if (!game.ok) {
        useUi.getState().failWebgl();
      } else {
        useUi.getState().attachEngine(game);
        game.attachInput(left, right);
        game.start();
      }
    } catch {
      useUi.getState().failWebgl();
    }
    const g = game;
    const unlock = (): void => { unlockAudio(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      g?.dispose();
      useUi.getState().detachEngine();
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" data-testid="game-canvas" />
      <div ref={leftRef} className="touch-zone left" data-testid="touch-left" aria-hidden="true" />
      <div ref={rightRef} className="touch-zone right" data-testid="touch-right" aria-hidden="true" />
      <Hud />
      <TouchControls leftRef={leftRef} rightRef={rightRef} />
      <Menus />
    </div>
  );
}
