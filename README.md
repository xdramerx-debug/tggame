# TENEBRIS

**Мобильный 3D roguelite survival RPG для Telegram Mini Apps.** Только телефон, только landscape, только касания.

> Статус: **этап 5 из 13 — пайплайн ассетов и скелетная анимация**. Герой — сгенерированный GLB со скелетом и семью клипами (`idle/walk/run/attack/dodge/hit/death`), который управляется через `AnimationMixer`; модели собираются из кода командой `npm run assets`. Дальше — боёвка, лут и выживание (см. дорожную карту).

---

## Что уже работает

- **Единый WebGL-контекст** на всю сессию: `WebGLRenderer` c `powerPreference: 'high-performance'`, ACES tone mapping, `PCFSoftShadowMap`.
- **Orbit-камера** третьего лица: pitch −15°…+45°, зум 2.5–8 м, smooth follow 0.1 с, collision-aware (мгновенно поджимается у стены, плавно возвращается).
- **Пост-обработка**: UnrealBloom (0.4 / порог 0.85) + Vignette + FilmGrain (0.02) + FXAA; SSAO только на high.
- **Адаптивное качество**: пресеты high / medium / low, авто-понижение при FPS < 45, защита от осцилляции (8 с между переключениями), ручной выбор в настройках.
- **Мобильный слой**: принудительный landscape (Telegram + Screen Orientation API + CSS-оверлей «Поверните телефон»), safe-area через `env()` и Telegram insets, Screen Wake Lock, пауза по `visibilitychange`/`blur`/`pagehide`, запрет контекстного меню, double-tap zoom, pinch-zoom страницы и pull-to-refresh.
- **Процедурное подземелье (этап 4)**: BSP на 56×56 тайлов, 7 комнат, коридоры 2 м по MST с петлями, типы комнат из `src/data/rooms.json` (боевая, сокровищница, привал, алтарь + вход/выход), потолки 3–5 м, двери с открыванием по приближению, мебель и колонны instanced, свет по бюджету тарифа, `FogExp2 0.04`, спуск на следующий этаж через руну выхода. Детерминированность по сиду (`?seed=1234`).
- **PBR-материалы** с процедурными (Canvas2D) albedo/normal/roughness и UV в мировых координатах (0.5 UV/м) — текстура не «сетит» на стыках тайлов.
- **Telegram**: авто-тема (`themeParams`), haptic-обёртка (только `HapticFeedback`, без `navigator.vibrate`), MainButton/BackButton, fullscreen, `disableVerticalSwipes`, подтверждение закрытия.
- **Настройки** (чувствительность камеры, размер кнопок, левша/правша, авто-атака, прозрачность HUD, вибро, качество, инверсия Y) с сохранением в IndexedDB (Dexie, схема из ТЗ).
- **Splash по стадиям** (движок → текстуры → модели → звук) с реальным прогрессом загрузки.
- **Физика (этап 3)**: Rapier3D WASM в отдельном чанке, фиксированный шаг 60 Гц с аккумулятором и ограничением 4 подшага, капсульный character controller (slide, autostep 0.35 м, snap-to-ground, уклон до 50°), гравитация, raycast камеры по физическим коллайдерам с исключением капсулы игрока, dev-визуализация коллайдеров (`?physics=1`).
- **Dev-оверлей производительности**: FPS, frame time, worst frame, draw calls, tris, активный пресет (`?perf=0` чтобы скрыть).

- **Пайплайн ассетов (этап 5)**: `npm run assets` собирает из THREE-геометрии героя (1.3k tris, 19 костей, 7 клипов), костяного стража (5 клипов) и мебель (сундук, алтарь, жаровня, факел, колонна) и экспортирует в GLB через `GLTFExporter` — без Blender и без единого бинарника в git. GLB валидируется (магия/скин/клипы) и заново загружается в тестах тем же `GLTFLoader`, что и в игре.
- **Скелетная анимация**: `CharacterModel` — конечный автомат (локомоция по скорости, одноразовые attack/dodge/hit, терминальная death), клипы атаки и рывка масштабируются под геймплейные окна, `hit` не сбивает замах.

## Управление (этап 2)

| Жест | Действие |
| --- | --- |
| Левый нижний угол (для правши) | Виртуальный стик: база 80 px, кнопка 36 px, мёртвая зона 15 %, база «прилипает» к пальцу в радиусе 120 px, возврат пружиной 150 мс |
| Свайп по противоположной половине | Вращение камеры, 0.25°/px (настраивается 0.1–0.5), инерция 100 мс |
| Пинч там же | Зум 2.5–8 м |
| Тап по зоне камеры | Быстрый удар (отключается в настройках) |
| ⚔️ | Атака, таргет 76 px, кулдаун 0.45 с |
| 🔥 / ❄️ | Скиллы, 60 px (заглушки до этапа 6) |
| 🛡️ | Уворот, 60 px, кулдаун 1.2 с |
| ⚡ | Взаимодействие, 56 px, появляется рядом с кристаллом |

Раскладка зеркалируется настройкой «Левша», размер кнопок масштабируется S/M/L, HUD — прозрачностью. Все таргеты ≥48 px, зазор 12 px, отклик на `pointerdown` (≤50 мс), haptic на нажатие.

## Стек

TypeScript (strict, без `any`) · Vite · React 18 · Zustand · TailwindCSS · Framer Motion · Three.js r186 · Rapier3D 0.21 (WASM) · Dexie · @telegram-apps/sdk v3. Howler подключается на этапе 10.

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

## Структура

```
src/
├── scripts/models/  генераторы героя/монстра/пропсов, риг, скиннинг, GLB-экспорт
├── game/
│   ├── core/        Engine, Renderer, Loop, CameraRig, Quality, PerfMonitor
│   ├── physics/     PhysicsWorld (Rapier), CharacterBody, FixedStep, капсулы
│   ├── visual/      PostFX, PhysicsDebug, процедурные текстуры и карты нормалей
│   ├── assets/      AssetLoader (GLB + кэш + SkeletonUtils-клоны), манифест моделей
│   ├── entities/    PlayerController, CharacterModel (анимации), HeroView, placeholder
│   ├── scenes/      DungeonScene (этап 4), TestScene (эталон этапа 3)
│   ├── world/       bsp, DungeonGenerator, DungeonMesh, Door, Props, RoomLights, gridRects
│   └── GameHost.ts  синглтон canvas + engine
├── input/           VirtualJoystick, CameraSwipe, CooldownTracker, InputLayer, TouchButton
├── mobile/          orientation, safeArea, wakeLock, fullscreen, gestures, lifecycle
├── telegram/        init, theme, haptic, buttons, viewport
├── ui/              Splash, MainMenu, GameScreen, Settings, Credits, Orientation, PerfOverlay
├── store/           Zustand: game + settings (persist в Dexie)
├── db/              Dexie v1 (saves, meta, stats, settings) + export/import
└── types/           engine, scene
```

Ассеты генерируются скриптами: модели — `scripts/models/` + `scripts/build-assets.ts` (этап 5), текстуры — процедурные в рантайме, аудио — этап 10. `npm run assets` пересобирает всё с нуля; `.glb` и `manifest.json` не коммитятся.

## Производительность

| Метрика | Бюджет | Сейчас (этап 1) |
| --- | --- | --- |
| Bundle gzip | < 3 MB | **~1.9 MB** (Rapier WASM 1.67 MB в отдельном ленивом чанке, приложение ~104 kB) |
| Draw calls | < 100 | ~28 на этаж (3 merged + ~10 instanced + двери + 4 меша героя) |
| Ассеты моделей | ≤ 1 MB | **343 kB** GLB (герой 123, монстр 133, мебель 87) |
| Physics | фикс. 60 Гц | 60 Гц, ≤4 подшага/кадр, ~50–80 статических коллайдеров этажа |
| Point lights | ≤ 4 (high/medium), ≤ 2 (low) | ровно по бюджету: факел + ближайшие комнаты + руна выхода |
| Input UI per frame | без React-рендеров | rAF пишет transform/CSS-переменные |
| Tris на сцене | < 120k | ~10–20k на этаж |
| Первый экран | < 2.5 с | splash скрывается сразу после boot движка |
| Пресеты | high/medium/low | авто-переключение по FPS |

Подробности и методика замеров — в [docs/PERF.md](docs/PERF.md), архитектурные решения — в [docs/DECISIONS.md](docs/DECISIONS.md).

## Дорожная карта

| Этап | Содержание | Статус |
| --- | --- | --- |
| 1 | Bootstrap mobile-first, движок, камера, пресеты, CI | ✅ |
| 2 | PointerEvents-фреймворк, джойстик, свайп-камера, кнопки, multitouch | ✅ |
| 3 | Rapier3D, капсульный контроллер, коллизии, камера-raycast | ✅ |
| 4 | BSP-подземелье: комнаты, коридоры, двери, свет, туман | ✅ |
| 5 | Пайплайн ассетов, GLB-модели, скелетная анимация | ✅ |
| 5–7 | Blender-пайплайн, боёвка, лут и инвентарь | ⏳ |
| 8–10 | Выживание, контент, аудио | ⏳ |
| 11–13 | Полиш, Telegram UX, оптимизация и релиз | ⏳ |

## Лицензии и титры

Все модели, текстуры и звуки генерируются скриптами этого репозитория. Сторонние ассеты — только CC0 и только с записью в [CREDITS.md](CREDITS.md). Библиотеки: см. CREDITS.md.
