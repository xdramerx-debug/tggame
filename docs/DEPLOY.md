# Деплой TENEBRIS

Игра — статический сайт. Никакого сервера, никакой базы: всё состояние живёт в
IndexedDB на устройстве и (опционально) в Telegram CloudStorage.

## 1. Сборка

```bash
npm ci
npm run assets     # GLB-модели, WAV-звуки, PNG-иконки, manifest.json
npm run build      # dist/
npm run check:dist # dist/index.html грузит хэшированный бандл, все ссылки живы
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

1. Settings → Pages → **Source: GitHub Actions** (один раз, руками).
2. Дальше публикация идёт сама: `.github/workflows/deploy.yml` запускается на
   **push в ветку `arena/**`**, повторяет typecheck/tests/build/size и заливает
   `dist/` как артефакт Pages.

Почему по push, а не кнопкой: `workflow_dispatch` GitHub открывает только для
workflow, который есть в **дефолтной ветке**, а `main` в этом репозитории пустой
— кнопки «Run workflow» просто нет. Push-триггер читается из той ветки, куда
пушат, поэтому деплой работает с текущей и не требует прав администратора на
переключение источника Pages.

Если `main` когда-нибудь наполнят приложением, кнопка появится сама —
`workflow_dispatch` в файле уже объявлен, и релиз можно будет делать вручную.

URL сайта: `https://<owner>.github.io/<repo>/` (у этого репозитория —
`https://xdramerx-debug.github.io/tggame/`).

### Частая ошибка: «висит заставка TENEBRIS»

Это значит, что хостинг отдаёт **исходный** `index.html` из корня ветки, а не
собранный из `dist/`: такой файл грузит `/src/main.tsx`, которого в продакшене
нет, поэтому React никогда не стартует. Проверка — открыть
`https://<owner>.github.io/<repo>/manifest.webmanifest`: если 404, деплой не
прошёл. Лечится запуском workflow «Deploy to GitHub Pages» (раздел 2).
Начиная с v1.0.0 страница сама через 20 секунд показывает «Игра не загрузилась» с
кнопкой «Обновить» вместо бесконечной заставки.

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
