// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { useGame } from '@/state/store';

/**
 * DOM-level navigation test.
 *
 * jsdom has no WebGL, so the fight screen is expected to fall back to its
 * "3D не запустилось" panel — which is exactly the safety net we want to
 * verify. The real renderer is exercised in Playwright on CI.
 */

// React 18 needs this flag for act() to flush effects in a non-test-runner build.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
}

function click(selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  act(() => {
    element.click();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  useGame.setState({
    screen: 'menu',
    fighterId: 'grizlo',
    opponentId: 'shveya',
    difficulty: 'normal',
    result: null,
  });
  mount();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('app navigation', () => {
  it('starts on the menu and opens the select screen', () => {
    expect(container.textContent).toContain('FREAK');
    click('[data-testid="menu-start"]');
    expect(useGame.getState().screen).toBe('select');
    expect(container.textContent).toContain('выбери');
  });

  it('picks a fighter and a difficulty', () => {
    click('[data-testid="menu-start"]');
    const oko = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('ОКО'));
    expect(oko).toBeDefined();
    act(() => {
      oko?.click();
    });
    expect(useGame.getState().fighterId).toBe('oko');

    const hard = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('мясник'));
    act(() => {
      hard?.click();
    });
    expect(useGame.getState().difficulty).toBe('hard');
  });

  it('starts a fight and degrades gracefully when WebGL is missing', () => {
    click('[data-testid="menu-start"]');
    click('[data-testid="select-start"]');
    expect(useGame.getState().screen).toBe('fight');
    expect(container.querySelector('[data-testid="fight-canvas"]')).not.toBeNull();
    // jsdom cannot create a WebGL context: the screen must explain itself
    // instead of throwing out of the effect and leaving a blank page.
    expect(container.textContent).toContain('3D не запустилось');
  });

  it('returns to the menu from the failure panel', () => {
    click('[data-testid="menu-start"]');
    click('[data-testid="select-start"]');
    const back = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('в меню'));
    expect(back).toBeDefined();
    act(() => {
      back?.click();
    });
    expect(useGame.getState().screen).toBe('menu');
  });
});
