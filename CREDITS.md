# CREDITS

TENEBRIS использует только собственные процедурные ассеты. Ни один внешний
asset-pack не подключён в основном пайплайне.

## Ассеты

| Тип | Источник | Лицензия |
| --- | --- | --- |
| Модели персонажей, монстров, окружения | `scripts/blender/*.py` (Blender headless) | Собственные, проект TENEBRIS |
| Текстуры (albedo / normal / ORM) | `scripts/textures/*.ts` + рантайм-генерация | Собственные |
| Аудио (SFX, амбиент) | `scripts/audio/*.ts` (процедурный синтез) | Собственные |
| UI-иконки (этап 1) | системные эмодзи, заменяются на собственные SVG | — |
| Шрифты | системные (без загрузки внешних шрифтов) | — |

Внешние CC0-ассеты на текущий момент: **нет**. При добавлении любого файла
в `public/assets/` необходимо указать источник, автора и лицензию в этой таблице.

## Библиотеки

| Библиотека | Лицензия | Использование |
| --- | --- | --- |
| three.js | MIT | 3D-рендер, пост-обработка |
| react / react-dom | MIT | UI-слой |
| zustand | MIT | состояние |
| dexie | Apache-2.0 | IndexedDB |
| framer-motion | MIT | анимации UI ≤300 мс |
| @telegram-apps/sdk | MIT | Telegram Mini Apps |
| tailwindcss | MIT | стили HUD |
| vite | MIT | сборка |
| vitest / @playwright/test | MIT / Apache-2.0 | тесты |
| howler | MIT | воспроизведение процедурного аудио (WebAudio) |

Запланировано: `@gltf-transform/*` (MIT), `sharp`/`node-canvas` (Apache-2.0 / MIT) для офлайн-текстур.

Аудио: все 18 дорожек синтезированы кодом (`scripts/audio/*.ts`), ни одного
скачанного сэмпла. Howler используется только как плеер — никаких его ассетов
в бандле нет.

## Благодарности

- Команде three.js за примеры `EffectComposer`/`UnrealBloomPass`, ставшие основой цепочки пост-обработки.
- Telegram за Bot API 8.0 (fullscreen, orientation lock, haptics).
