import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Hud } from '@/ui/Hud';
import { MenuScreen } from '@/ui/MenuScreen';
import { ResultScreen } from '@/ui/ResultScreen';
import { SelectScreen } from '@/ui/SelectScreen';
import { Battle } from '@/fight/battle';
import { GRIZLO, SHVEYA } from '@/characters/roster';
import { INTRO_TICKS } from '@/fight/battle';
import { NEUTRAL_INPUT } from '@/fight/types';

/**
 * Server-render smoke tests: they catch broken JSX, bad hooks order and
 * undefined props without needing a browser. The 3D fight screen is covered by
 * Playwright instead, since it needs a real WebGL context.
 */
describe('screens render', () => {
  it('renders the menu with the title and the call to action', () => {
    const html = renderToString(createElement(MenuScreen));
    expect(html).toContain('FREAK');
    expect(html).toContain('в яму');
  });

  it('renders all four fighters on the select screen', () => {
    const html = renderToString(createElement(SelectScreen));
    for (const name of ['ГРЫЗЛО', 'ШВЕЯ', 'ОКО', 'ПЕЧЬ']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('драться');
  });

  it('renders the HUD with health, timer and round pips', () => {
    const battle = new Battle(GRIZLO, SHVEYA);
    for (let i = 0; i < INTRO_TICKS - 1; i += 1) battle.step([NEUTRAL_INPUT, NEUTRAL_INPUT]);
    const html = renderToString(
      createElement(Hud, { snapshot: battle.snapshot(), player: GRIZLO, opponent: SHVEYA, onPause: () => undefined }),
    );
    expect(html).toContain('ГРЫЗЛО');
    expect(html).toContain('В ЯМУ!');
    expect(html).toContain('60');
  });

  it('renders the empty result screen safely', () => {
    const html = renderToString(createElement(ResultScreen));
    expect(html).toContain('в меню');
  });
});
