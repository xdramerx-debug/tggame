# Деплой TENEBRIS

Игра — статический сайт. Никакого сервера, никакой базы: всё состояние живёт в
IndexedDB на устройстве и (опционально) в Telegram CloudStorage.

## 1. Сборка

```bash
npm ci
npm run assets     # GLB-модели, WAV-звуки, PNG-иконки, manifest.json
npm run build      # dist/
npm run size       # бюджет бандла (< 3 MB gzip)
```

`dist/` самодостаточен: `index.html`, JS-чанки, `assets/` (модели, звук, иконки,
манифест) и `manifest.webmanifest`. Все ассеты генерируются, в git их нет —
сборка обязана начинаться с `npm run assets`.

Локальная проверка продакшн-сборки:

```bash
npm run preview -- --port 4173
```

`vite.config.ts` использует `base: './'`, поэтому сайт работает и в корне домена,
и в подкаталоге (`/tggame/`), и внутри Telegram WebView.

## 2. GitHub Pages

Pages в репозитории настроены как **legacy** (публикация из ветки), а сборка
лежит в `dist/`. Чтобы публиковать артефакт:

1. Settings → Pages → **Source: GitHub Actions**.
2. Actions → **Deploy to GitHub Pages** → *Run workflow*.

Workflow `.github/workflows/deploy.yml` намеренно ручной: он повторяет
typecheck/tests/build/size и только потом публикует. Так релиз не может
разъехаться с зелёным CI, а неудачная попытка публикации не красит ветку.

URL сайта: `https://<owner>.github.io/<repo>/`.

## 3. Telegram

1. **@BotFather** → `/newbot` (или существующий бот).
2. `/newapp` → выбрать бота → задать короткое имя (`tenebris`).
3. Web App URL: адрес из шага 2 (`https://<owner>.github.io/<repo>/`).
4. `/setmenubutton` → выбрать бота → указать тот же URL и подпись «Играть».
5. Для инвайтов: `VITE_TG_APP_SLUG=<bot_username>/<app_short_name>` (по умолчанию
   `tenebris_bot/tenebris`). Ссылка собирается как
   `https://t.me/<slug>?startapp=<payload>`.

Требования клиента: Telegram 7.7+ (fullscreen, `disableVerticalSwipes`),
CloudStorage — 6.9+. Всё, что не поддерживается, тихо отключается: игра
остаётся играбельной на старом клиенте.

## 4. Проверка после деплоя

- Открыть URL в обычном браузере: должен работать лендскейп-режим и не быть
  404 на `/assets/models/hero.glb`, `/assets/audio/*.wav`, `/assets/icons/*.png`.
- Открыть в Telegram: fullscreen без системных баров, кнопка «назад» закрывает
  шиты, а не приложение.
- Settings → строка статуса: «Прогресс дублируется в облако Telegram».
- `?reset=1` — сброс прогресса (с подтверждением).
- `?quality=low&seed=42` — детерминированный забег на слабом устройстве.

## 5. Откат

Релиз — это артефакт Pages. Откат = перезапуск workflow с предыдущего коммита
(`Actions → Deploy → Run workflow`, предварительно переключив checkout на нужный
SHA) либо revert коммита в ветке и повторный деплой. Локальных миграций нет:
Dexie-схема версионирована, но сброс прогресса — только через `?reset=1`.
