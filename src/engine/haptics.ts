/** Вибро-отклик через Vibration API (Android). Тихо деградирует на iOS. */

function v(pattern: number | number[]): void {
  try {
    navigator.vibrate(pattern);
  } catch {
    // не поддерживается
  }
}

export const haptics = {
  shot(heavy: boolean): void { v(heavy ? 18 : 8); },
  hit(): void { v(12); },
  headshot(): void { v([10, 30, 14]); },
  kill(): void { v([14, 26, 20]); },
  hurt(): void { v(55); },
  heavyHurt(): void { v([70, 40, 90]); },
  explosion(): void { v([40, 30, 80]); },
  pickup(): void { v(10); },
  buy(): void { v(14); },
  levelUp(): void { v([20, 40, 20, 40, 30]); },
  death(): void { v([120, 60, 200]); },
  waveStart(): void { v([30, 50, 30]); },
};
