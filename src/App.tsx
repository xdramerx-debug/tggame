import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { Game } from './engine/game';
import { initAudio } from './engine/audio';
import { useUi } from './state/store';
import { Hud } from './ui/Hud';
import { Menus } from './ui/Menus';
import { TouchControls } from './ui/TouchControls';

/**
 * App shell: mounts the engine into a host div and layers React UI on top.
 * The engine lives outside React state — only snapshots flow through zustand.
 */
export function App(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let game: Game | null = null;
    try {
      game = new Game(host, {
        onSnapshot: (s) => { useUi.getState().applySnapshot(s); },
        onEvent: (e) => { useUi.getState().applyEvent(e); },
      });
      useUi.getState().attachEngine(game);
    } catch {
      useUi.getState().failWebgl();
    }
    const g = game;

    const onVis = (): void => { g?.onVisibility(document.hidden); };
    document.addEventListener('visibilitychange', onVis);
    const unlock = (): void => { initAudio(); };
    window.addEventListener('pointerdown', unlock, { once: true });

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      g?.dispose();
      useUi.getState().detachEngine();
    };
  }, []);

  return (
    <div className="app">
      <div ref={hostRef} className="game-host" data-testid="game-host" />
      <Hud />
      <TouchControls />
      <Menus />
    </div>
  );
}
