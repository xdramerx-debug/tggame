# TENEBRIS

**Мобильный 3D roguelite survival RPG для Telegram Mini Apps.** Только телефон, только landscape, только касания.

> Статус: **этап 1 из 13 — mobile-first bootstrap**. Реализованы движок, orbit-камера, пресеты качества, мобильный слой, Telegram-обёртки, настройки и валидация сборки. Боевая система, подземелье и контент появятся на следующих этапах (см. дорожную карту).

---

## Что уже работает

- **Единый WebGL-контекст** на всю сессию: `WebGLRenderer` c `powerPreference: 'high-performance'`, ACES tone mapping, `PCFSoftShadowMap`.
- **Orbit-камера** третьего лица: pitch −15°…+45°, зум 2.5–8 м, smooth follow 0.1 с, collision-aware (мгновенно поджимается у стены, плавно возвращается).
- **Пост-обработка**: UnrealBloom (0.4 / порог 0.85) + Vignette + FilmGrain (0.02) + FXAA; SSAO только на high.
- **Адаптивное качество**: пресеты high / medium / low, авто-понижение при FPS < 45, защита от осцилляции (8 с между переключениями), ручной выбор в настройках.
- **Мобильный слой**: принудительный landscape (Telegram + Screen Orientation API + CSS-оверлей «Поверните телефон»), safe-area через `env()` и Telegram insets, Screen Wake Lock, пауза по `visibilitychange`/`blur`/`pagehide`, запрет контекстного меню, double-tap zoom, pinch-zoom страницы и pull-to-refresh.
- **Тестовая арена**: PBR-материалы с процедурными (Canvas2D) albedo/normal/roughness, instanced-колонны, мерцающие факелы (2 PointLight), emissive-кристаллы, `FogExp2 0.04` — валидация теней, блума и бюджетов сцены.
- **Telegram**: авто-тема (`themeParams`), haptic-обёртка (только `HapticFeedback`, без `navigator.vibrate`), MainButton/BackButton, fullscreen, `disableVerticalSwipes`, подтверждение закрытия.
- **Настройки** (чувствительность камеры, размер кнопок, левша/правша, авто-атака, прозрачность HUD, вибро, качество, инверсия Y) с сохранением в IndexedDB (Dexie, схема из ТЗ).
- **Splash по стадиям** (движок → текстуры → модели → звук) с реальным прогрессом загрузки.
- **Dev-оверлей производительности**: FPS, frame time, worst frame, draw calls, tris, активный пресет (`?perf=0` чтобы скрыть).

## Стек

TypeScript (strict, без `any`) · Vite · React 18 · Zustand · TailwindCSS · Framer Motion · Three.js r186 · Dexie · @telegram-apps/sdk v3. Rapier3D, Howler и Vitest/Playwright-обвязка подключаются на этапах 3 и 10.

Целевые браузеры: iOS 15+ (WebKit в Telegram), Chrome Android 100+. Десктопной версии нет и не будет.

## Команды

```bash
npm ci            # установка зависимостей
npm run dev       # dev-сервер на 0.0.0.0:5173 (preview в браузере)
npm run build     # strict typecheck + production build
npm run preview   # предпросмотр собранной версии
npm run typecheck # только tsc --noEmit
npm run lint      # ESLint (type-aware)
npm run test      # Vitest: камера, качество, процедурные текстуры, safe-area
npm run test:e2e  # Playwright: Pixel 7 + iPhone 13 (landscape)
npm run size      # проверка бюджета бандла (< 3 MB gzip)
```

Первый запуск E2E требует браузеров: `npx playwright install --with-deps chromium webkit`.

## Управление (этап 1)

В production-сборке управление появится на этапе 2 (виртуальный стик, свайп-камера, кнопки).
Для проверки камеры в dev-режиме работает отладочный drag по canvas (мышь/палец) и колесо для зума.

## Структура

```
src/
├── game/
│   ├── core/        Engine, Renderer, Loop, CameraRig, Quality, PerfMonitor
│   ├── visual/      PostFX, процедурные текстуры и карты нормалей
│   ├── scenes/      TestScene (этап 1), далее Dungeon
│   └── GameHost.ts  синглтон canvas + engine
├── mobile/          orientation, safeArea, wakeLock, fullscreen, gestures, lifecycle
├── telegram/        init, theme, haptic, buttons, viewport
├── ui/              Splash, MainMenu, GameScreen, Settings, Credits, Orientation, PerfOverlay
├── store/           Zustand: game + settings (persist в Dexie)
├── db/              Dexie v1 (saves, meta, stats, settings) + export/import
└── types/           engine, scene
```

Ассеты, генерируемые скриптами (`scripts/blender`, `scripts/textures`, `scripts/audio`), подключаются на этапах 5–10. Основной пайплайн — только собственные процедурные ассеты.

## Производительность

| Метрика | Бюджет | Сейчас (этап 1) |
| --- | --- | --- |
| Bundle gzip | < 3 MB | **~290 kB** |
| Draw calls | < 100 | ~10 в тестовой сцене |
| Tris на сцене | < 120k | ~6k |
| Первый экран | < 2.5 с | splash скрывается сразу после boot движка |
| Пресеты | high/medium/low | авто-переключение по FPS |

Подробности и методика замеров — в [docs/PERF.md](docs/PERF.md), архитектурные решения — в [docs/DECISIONS.md](docs/DECISIONS.md).

## Дорожная карта

| Этап | Содержание | Статус |
| --- | --- | --- |
| 1 | Bootstrap mobile-first, движок, камера, пресеты, CI | ✅ |
| 2 | PointerEvents-фреймворк, джойстик, свайп-камера, кнопки | ⏳ |
| 3 | Rapier + character controller | ⏳ |
| 4 | BSP-подземелье | ⏳ |
| 5–7 | Blender-пайплайн, боёвка, лут и инвентарь | ⏳ |
| 8–10 | Выживание, контент, аудио | ⏳ |
| 11–13 | Полиш, Telegram UX, оптимизация и релиз | ⏳ |

## Лицензии и титры

Все модели, текстуры и звуки генерируются скриптами этого репозитория. Сторонние ассеты — только CC0 и только с записью в [CREDITS.md](CREDITS.md). Библиотеки: см. CREDITS.md.
