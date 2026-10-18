Ты — senior fullstack game developer, technical artist и эксперт 
по Telegram Mini Apps. Разработай с нуля браузерную MMORPG 
«Эхо Разлома» (Echo of the Rift) на Three.js, оптимизированную 
под мобильные телефоны, запускаемую как Telegram Mini App 
с хостингом на GitHub Pages и бэкендом на Firebase.

ГЛАВНЫЕ ПРИОРИТЕТЫ (в порядке важности):
1. ВИЗУАЛ — игра должна выглядеть современно, дорого и красиво. 
   Это ключевая фича, а не бонус.
2. Экран загрузки с полосой прогресса и этапами — первый 
   контакт игрока, должен продавать игру.
3. Стабильные 60 FPS на mid-устройствах (30+ на low).
4. Рабочий геймплей и MMO-инфраструктура.

Работай итеративно по фазам. Пиши чистый TypeScript с 
комментариями. После каждой итерации — summary и чек-лист.

═══════════════════════════════════════════════════════════
1. КОНЦЕПЦИЯ И ЛОР
═══════════════════════════════════════════════════════════
500 лет назад катаклизм «Разлом» разорвал реальность. Из 
трещин хлынули существа «Эхо». Люди научились привязывать 
их к душе — так появились Призыватели. Игрок — юный 
Призыватель, собирающий Эхо, развивающий убежище и 
сражающийся за Источники Силы.

Жанр: action-RPG + тактика призывов.
Ключевой крючок: «Стратегия важнее силы» — формации, 
синергии стихий, контр-пики.

═══════════════════════════════════════════════════════════
2. ART DIRECTION — ВИЗУАЛ КАК ГЛАВНАЯ ФИЧА
═══════════════════════════════════════════════════════════

2.1. Общий стиль
- Stylized semi-realistic low-poly с качественными 
  материалами и светом. Референсы: Genshin Impact, 
  Torchlight Infinite, Diablo Immortal (mobile), 
  Honkai Star Rail — но легче по полигонам.
- «Живой» мир: всё в кадре имеет микроанимацию (трава 
  колышется, листья падают, кристаллы пульсируют, 
  частицы летят).
- Контрастная палитра: тёмные базы (земля, камни) + 
  светящиеся магические акценты.
  Primary: #7B2CBF (фиолет), #00D9C0 (бирюза), 
  #FF6B35 (оранж), #FFD23F (золото).
  Фон/тени: #0A0612, #1A1226, #2D1F3F.
- Никакого «серого пластика» — каждая поверхность с 
  характером (шероховатость, нормал-мап, лёгкий 
  fresnel).

2.2. Технические приёмы рендеринга (ОБЯЗАТЕЛЬНО)
- PBR-материалы (MeshStandardMaterial / MeshPhysicalMaterial):
  metalness, roughness, normal, emissive maps.
- IBL-освещение через PMREMGenerator + HDRI (маленький, 
  256×256, ~100KB) — даёт мгновенно дорогой вид.
- Направленный свет + HemisphereLight + 1-2 point lights 
  для магии. Тени: PCFSoftShadowMap, 1024px (mid/high), 
  выкл (low).
- Fog + градиентный skybox (не просто цвет — процедурный 
  градиент с солнцем/луной).
- Bloom (UnrealBloomPass) только на emissive-элементах 
  (кристаллы, магия, UI-эффекты в мире). Intensity 0.6, 
  threshold 0.85.
- Tone mapping: ACESFilmic, exposure 1.1.
- Цветокоррекция: LUT-фильтр (тепло-холодный контраст, 
  лёгкая teal-and-orange) через ShaderPass.
- Vignette + лёгкий film grain (intensity 0.03).
- SSAO (только high-tier) — даёт глубину.
- FXAA / SMAA для сглаживания.
- Screen-space reflections — только для воды (high-tier).
- Vertex-шейдер «ветра» на траве/листве — выглядит 
  дёшево, а даёт огромный эффект «живого мира».

2.3. Постобработка и cinematic-фишки
- EffectComposer chain с пресетами:
  Low: Render → FXAA
  Mid: Render → Bloom → Vignette → FXAA
  High: Render → SSAO → Bloom → ColorGrade → Vignette 
  → FilmGrain → SMAA
- Depth of Field (BokehPass) на high — только в катсценах 
  и диалогах, не в геймплее (дорого).
- Cinematic intro при первом запуске: 8-секундная 
  камера-панорама по миру + плавный fade-in в игру. 
  Пропускается тапом.
- Плавные переходы между сценами: fade-to-black 
  (0.4с) + iris-wipe с рунным эффектом (0.6с) + 
  screen dissolve при телепорте.
- Hit-stop на критах (0.08с), screen shake с 
  декелерацией, chromatic aberration spike при 
  получении урона (0.2с, амплитуда 0.003).
- Slow-motion (0.3× на 0.4с) при активации ульты 
  персонажа.
- Мокап-«speed lines» (radial blur) при дэше.
- Всплывающие floating damage numbers (пул из 40): 
  криты крупнее, золотые с particles.
- Screen-space ripples от шагов в воде/песке.

2.4. Модели и анимации
- Модели: ≤ 5K треугольников на персонажа, ≤ 8K на 
  босса. Атлас текстур 1024×1024 (max).
- Скелетная анимация через glTF: idle, walk, run, 
  attack, cast, hit, death, special (у каждого 
  существа минимум 6 клипов).
- Анимации должны быть «читаемыми» — плавные 
  ease-in-out, без телепортаций поз.
- Idle-анимации с «дыханием» и микро-движениями 
  (моргание, повороты головы, покачивание).
- Blend tree (простенький): idle↔walk↔run через 
  веса по скорости.
- Вторичная анимация: плащ/волосы/хвосты покачиваются 
  (spring bones через verlet — просто, но эффектно).

2.5. UI/UX — визуал интерфейса
- Стеклянные панели: backdrop-filter: blur(12px) 
  saturate(140%), полупрозрачный фон rgba(15,10,25,0.65), 
  тонкие рамки с градиентом (1px, от #7B2CBF к 
  #00D9C0), внутренние highlight-полоски сверху 
  (как в iOS-модалках).
- Все иконки — единый стиль, рунные, с тонкой 
  обводкой и мягким glow (SVG + filter: drop-shadow).
- Кнопки: крупные (≥60px), с press-state (scale 0.95), 
  ripple-эффектом от точки тапа, haptic на press.
- Заголовки: шрифт стилизованный (Cinzel, Marcellus, 
  Unbounded) для лора, Inter/Roboto — для геймплея.
- Числовые значения (HP, урон, ресурсы) — 
  tabular-nums, крупный вес, цветовое кодирование.
- Плавные motion-переходы UI: все появления/скрытия 
  через GSAP (ease: "power3.out", 0.3–0.5с, 
  stagger для списков 0.05с).
- Микро-анимации: 
  - пульсация кнопки «В бой» при готовности
  - покачивание иконки призыва при готовности
  - fill-анимация HP-бара с переливом
  - числа XP «прыгают» вверх при получении
  - конфетти-частицы при level-up
- HUD минималистичен: скрываем всё лишнее, 
  оставляем только критичное (HP, MP, скиллы). 
  Вне боя — «чистый экран» без интерфейса через 3с.
- Адаптив: на маленьких экранах (< 380px по ширине) 
  пересобираем HUD, тач-зоны ≥ 44px.
- Тёмная и светлая темы: авто по Telegram 
  themeParams.colorScheme. Цвета синхронизируются 
  с Telegram (bg_color, text_color, button_color, 
  secondary_bg_color).

2.6. Частицы и VFX
- Огонь: 3 слоя (ядро-emissive сфера, sprite-пламя, 
  дым) + bloom. Не более 60 particles на эффект.
- Вода: шейдер с нормал-мапой и прокруткой UV.
- Магия: турбулентные искры + light pulse.
- Призыв: вспышка рунного круга на земле (decal + 
  shader, 1.2с), вертикальный луч, screen flash, 
  ripple в камере.
- Удар оружием: slash-trail через ribbon mesh 
  с fade-out (0.15с).
- Смерть монстра: dissolve (clipping shader) + 
  particles + drop loot с bounce-анимацией.
- Все VFX — пулы, никогда не создавать в runtime 
  чаще раза в 2с.

2.7. Экранные эффекты
- При низком HP: red vignette + пульсирующая 
  обводка по краям (CSS-анимация, не WebGL).
- При низком MP: голубая дымка у краёв.
- При критическом ударе: белая вспышка 50мс.
- Water splash, dust clouds при движении по разным 
  поверхностям.

═══════════════════════════════════════════════════════════
3. ЭКРАН ЗАГРУЗКИ (BOOT SCREEN) — ПЕРВЫЙ КОНТАКТ
═══════════════════════════════════════════════════════════

Экран загрузки — это отдельная сцена (BootScene), 
спроектированная как витрина игры. Не скучный спиннер, 
а мини-презентация.

3.1. Структура экрана
- Фон: анимированный градиент (CSS-анимация 
  linear-gradient с hue-shift), поверх — видео-луп 
  кристалла или 3D-модель (Three.js canvas за 
  UI-слоем), вращающаяся медленно (0.05 rad/s), 
  с bloom и частицами.
- По центру сверху: логотип «Эхо Разлома» (SVG, 
  выполненный рунным шрифтом с glow) с 
  анимацией появления (scale 0.8→1, fade-in 0.6с).
- Под логотипом: слоган «Стратегия важнее силы» 
  (opacity 0.6, fade-in с задержкой 0.3с).
- Внизу: полоса загрузки.
- В самом низу: подсказки-тизеры, меняющиеся каждые 
  2.5с (fade-in/out): «Собирай Эхо...», «Формируй 
  команду...», «Пробуждай силу...», «Стань 
  Призывателем...».
- Мелкий текст снизу: версия игры, ссылка на 
  Telegram-канал / поддержку (в углу).

3.2. Полоса загрузки (кастомная)
- Не стандартный <progress>, а кастомная 
  анимированная полоса:
  - Ширина 60% экрана, высота 6px, скруглённые 
    края (border-radius 999px).
  - Фон: rgba(255,255,255,0.08).
  - Заполнение: градиент по горизонтали 
    #7B2CBF → #00D9C0 → #FF6B35, с 
    анимированным "shimmer" поверх (белая 
    полупрозрачная полоска, движется слева 
    направо, 1.5с цикл).
  - На конце заполнения — светящаяся точка 
    (glow 8px).
  - Процент загрузки: крупная цифра над полосой 
    справа, "tabular-nums", 24px, bold.
  - Текст-статус слева над полосой: «Загрузка 
    мира...» (смена текста по этапам, 
    fade-in/out 200мс).

3.3. Этапы загрузки (веса прогресса)
1. 0–8%: «Инициализация Telegram...» — 
   WebApp.ready(), expand(), тема
2. 8–15%: «Проверка авторизации...» — initData 
   → Cloud Function validateTelegram → signIn
3. 15–25%: «Загрузка профиля...» — Firestore 
   get user doc (или создание нового)
4. 25–55%: «Загрузка моделей...» — glTF 
   (можно параллельно, с прогрессом по каждому файлу)
5. 55–70%: «Загрузка текстур...» — KTX2 
6. 70–80%: «Загрузка звуков...» — Howler (можно 
   отложить критичные, остальные — lazy)
7. 80–88%: «Сборка мира...» — сцена, свет, туман, 
   instanced-трава
8. 88–95%: «Компиляция шейдеров...» — 
   renderer.compile(scene, camera) 
   (обязательно перед стартом, чтобы не было 
   фризов на первом кадре)
9. 95–100%: «Пробуждение Эхо...» — финальная 
   анимация
10. 100%: переход в игру (fade-out 0.8с с 
    iris-эффектом)

3.4. Что происходит в фоне
- Проценты — не «фейковые». Реальный прогресс 
  через Promise.all + счётчик завершённых задач.
- Если этап занимает > 1.5с — полоса начинает 
  «пульсировать» (микро-анимация), чтобы не 
  казалось, что зависло.
- Если этап падает с ошибкой — переход на 
  error-экран: иконка, текст ошибки, кнопки 
  «Повторить», «Сообщить в поддержку», «Открыть 
  в браузере».
- Пользователь может тапнуть в любом месте 
  экрана — «skip intro» для cinematic (если 
  таковой есть), но не для загрузки.

3.5. Cinematic intro (после полосы, опционально)
- 8-секундная камера-панорама по миру: полёт над 
  долиной, кристаллы, силуэты монстров, озеро. 
  В конце — камера приземляется на персонажа.
- Внизу subtitle-строка с тизером лора.
- Тап в любом месте — skip с fade-out 0.3с.
- Не показывать при повторных запусках (флаг в 
  CloudStorage Telegram).

3.6. Технические требования к загрузке
- Общий вес первого экрана (before boot assets): 
  < 400 KB gzip — HTML + CSS + базовый JS + логотип.
- Грузим ассеты параллельно батчами (6–8 файлов 
  одновременно, чтобы не забивать мобильный канал).
- Прогресс-бар должен двигаться плавно 
  (CSS transition 0.3s ease-out на width), 
  не дёргаться.
- Все прогресс-события — через event bus, 
  UI-слой подписан на updateProgress(percent, status).
- Обязательно показывать полосу даже для быстрых 
  загрузок (минимум 1.2с на экране, иначе 
  выглядит как «мигание»). Если всё загрузилось 
  за 0.8с — добить до 100% за оставшееся время 
  с ускоренной анимацией.

═══════════════════════════════════════════════════════════
4. ТЕХНИЧЕСКИЙ СТЕК
═══════════════════════════════════════════════════════════

Frontend:
- TypeScript strict, Three.js r160+, WebGL2
- Vite + vite-plugin-gh-pages, base = '/<repo-name>/'
- UI: Vanilla TS + CSS-переменные (без React)
- Анимации UI: GSAP (только для UI и переходов)
- Звук: Howler.js (старт после первого tap — iOS)
- Хранилище: IndexedDB (idb) + Telegram.CloudStorage
- Post-processing: Three.js EffectComposer
- Размер бандла MVP: < 1.5 MB gzip

Backend (Firebase):
- Auth: custom token из Telegram initData
- Firestore: профили, инвентарь, прогресс
- Realtime DB: чат, presence, лидерборд, PvP-лобби
- Cloud Functions (Node 20): validateTelegram, 
  onUserUpdate, submitSave, chatModerate, dailyReward
- Storage: не для ассетов (они в бандле)
- Firebase Hosting: не использовать

Telegram:
- telegram-web-app.js (обязательно, единственный CDN)
- BotFather /newapp → URL = GH Pages
- HTTPS обязателен (GH Pages даёт)

CI/CD:
- .github/workflows/deploy-pages.yml — build → gh-pages
- .github/workflows/deploy-functions.yml — firebase deploy

═══════════════════════════════════════════════════════════
5. СТРУКТУРА ПРОЕКТА
═══════════════════════════════════════════════════════════
/src
  /core           Engine, Loop, Input, EventBus, AssetLoader, 
                  SaveManager, DeviceProfiler, LoadingManager
  /platform       TelegramBridge, FirebaseClient, AuthService, 
                  HapticService
  /render         Renderer, CameraRig, PostFX, Particles, 
                  QualityManager, MaterialLib
  /world          SceneManager, Terrain, Props, Lighting, 
                  DayNight, Skybox, InstancedFlora
  /entities       Entity, Player, Summon, Monster, NPC, 
                  Projectile, DamageNumber
  /systems        CombatSystem, SummonSystem, ProgressionSystem, 
                  InventorySystem, QuestSystem, DialogueSystem, 
                  AiSystem, FormationSystem, SynergySystem, 
                  LootSystem
  /data           /summons /monsters /items /quests /abilities 
                  (JSON — весь баланс)
  /ui             BootScreen, HUD, Joystick, ActionButtons, 
                  Inventory, SummonCodex, SkillTree, Map, 
                  Dialogue, Tutorial, MainMenu, Settings, 
                  Leaderboard, Chat, Toast
  /scenes         BootScene, AuthScene, CinematicScene, 
                  MainMenuScene, WorldScene, ArenaScene
  /state          PlayerState, WorldState, typed EventBus
  /utils          Math, Random, Time, Pool, Throttle, Easing

/functions/src    validateTelegram, createFirebaseUser, 
                  onPlayerSave, leaderboard, chatModerate, 
                  dailyReward, index

/firebase         firestore.rules, database.rules.json, 
                  firestore.indexes.json

/public
  /models  /textures  /audio  /fonts  /icons  /hdri

/.github/workflows/deploy-pages.yml, deploy-functions.yml

vite.config.ts, tsconfig.json, package.json, 
firebase.json, .firebaserc, README.md

═══════════════════════════════════════════════════════════
6. TELEGRAM MINI APP — ИНТЕГРАЦИЯ
═══════════════════════════════════════════════════════════
Подключение:
- <script src="https://telegram.org/js/telegram-web-app.js">
- BootScene: await Telegram.WebApp.ready(), .expand()
- Fallback для браузера: mock-юзер «Test Player»

Обязательно использовать:
- initData → Cloud Function → custom token
- initDataUnsafe.user → displayName, photoUrl
- themeParams → адаптировать UI цвета
- colorScheme → тема (light/dark)
- HapticFeedback: light/medium/rigid на удары, 
  success на лут, warning на low HP
- BackButton: навигация между экранами, 
  hide на главном
- MainButton: «Начать игру», «В бой»
- CloudStorage: настройки звука/графики
- viewportStableHeight + safe area insets
- setHeaderColor / setBackgroundColor под игру
- disableVerticalSwipes (чтобы не закрывалось)
- enableClosingConfirmation при активной игре

Запрещено:
- window.alert/confirm/prompt → Telegram.WebApp.showAlert/Confirm
- window.open → openLink
- Логин/пароль → только initData

Ошибки:
- initData невалиден → экран «Открой через Telegram-бота»
- WebApp недоступен → dev-fallback

═══════════════════════════════════════════════════════════
7. FIREBASE — ИНТЕГРАЦИЯ
═══════════════════════════════════════════════════════════
Инициализация:
- Firebase SDK v10+ modular
- Конфиг через import.meta.env.VITE_FIREBASE_*
- Флаг VITE_FIREBASE_ENABLED для локального режима

Авторизация:
1. Клиент получает Telegram.WebApp.initData
2. POST /validateTelegram { initData }
3. CF проверяет HMAC-SHA256 (secret = HMAC("WebAppData", 
   BOT_TOKEN), hash сравнение, auth_date < 24ч)
4. CF создаёт/обновляет Firebase Auth user (uid = tg_ID)
5. Возвращает customToken
6. signInWithCustomToken
7. Обновление токена каждые 55 минут

Firestore:
- /users/{uid}: профиль, level, xp, settings
- /users/{uid}/summons/{id}: конфиг + уровень + слот
- /users/{uid}/inventory/{id}: qty, rarity
- /users/{uid}/quests/{id}: status, progress
- /users/{uid}/base/{id}: level
- /users/{uid}/progress: метрики

Realtime DB:
- /presence/{uid}: online, lastSeen, scene (30с throttle)
- /chat/global/{msgId}: uid, nick, text, ts
- /leaderboard/level: top-100 (CF-триггер)
- /leaderboard/arena: top-100
- /pvp/lobbies/{id}

Cloud Functions:
- validateTelegram — auth + token
- onUserUpdate — обновление leaderboard
- submitSave — античит (нельзя > 5 уровней / 10 мин)
- chatModerate — фильтр мата/спама
- dailyReward — cron 00:00 UTC

Правила:
- firestore.rules: чтение/запись только свои данные, 
  критичные поля — write: false на клиент
- database.rules.json: chat — write с валидацией, 
  leaderboard — read: true, write: false

Локальный режим:
- ISaveProvider: FirebaseSaveProvider | LocalSaveProvider
- Переключение через env
- Игра запускается без бэкенда для теста на GH Pages

Оптимизация затрат:
- Firestore batch writes раз в 60с
- RTDB presence throttle 30с
- enableIndexedDbPersistence — оффлайн
- Кэш профиля в IndexedDB на сессию

═══════════════════════════════════════════════════════════
8. МОБИЛЬНАЯ ОПТИМИЗАЦИЯ
═══════════════════════════════════════════════════════════
Ориентация:
- Landscape основная, portrait — fallback с подсказкой 
  «поверни телефон»
- 100dvh + viewportStableHeight

Управление (touch-first):
- Левый низ: виртуальный джойстик (~120px радиус, 
  мёртвая зона 15%)
- Правый низ: 4 кнопки (Attack, Dash, Skill, Summon), 
  ≥60px, отступ ≥16px + safe area
- Верх: HP/MP, мини-карта, меню
- Правая сторона: стек иконок призывов (1-3)
- Keyboard fallback для десктоп-теста

Производительность:
- renderer.setPixelRatio(min(DPR, 2)), авто-снижение 
  при просадке < 50 FPS
- DeviceProfiler: WebGL renderer + RAM + cores → 
  tier low/mid/high
- Пресеты:
  Low: без теней, без bloom, без SSAO, particles ×0.3, 
  дальность 80м, texture 256
  Mid: тени 512, bloom вкл, particles ×0.7, дальность 150м
  High: тени 1024, SSAO, bloom+colorGrade, particles ×1, 
  дальность 250м
- Frustum culling, LOD
- InstancedMesh: трава до 5000, камни
- ObjectPooling: пули, партиклы, damage numbers
- ≤ 50 анимированных сущностей одновременно
- Анимации NPC > 20м: 30 FPS (skip update)
- KTX2 текстуры, Draco glTF
- Модели ≤ 5K трис
- Звук: 22кГц mono SFX
- Обработка webglcontextlost
- Пауза при visibilitychange="hidden"
- Автоснижение качества при >3с просадки
- Не рендерить при Telegram.WebApp.isExpanded === false

CSS:
- viewport meta с user-scalable=no, viewport-fit=cover
- touch-action: none на canvas
- -webkit-user-select: none
- overscroll-behavior: none
- Safe area: env(safe-area-inset-*)

═══════════════════════════════════════════════════════════
9. ИГРОВЫЕ СИСТЕМЫ (по фазам)
═══════════════════════════════════════════════════════════

── ФАЗА 1: MVP + визуал ──
1. BootScreen с полосой загрузки (раздел 3 целиком) — 
   СНАЧАЛА, это первое что видит игрок.
2. Cinematic intro (опционально, скипабельный).
3. Telegram auth flow.
4. Персонаж от третьего лица: джойстик, dash 
   (i-frames 0.3с), sprint, orbit-камера.
5. Мир «Долина Первого Очага» 120×120м: 
   instanced-трава, деревья, камни, руины, туман, 
   day/night 5мин = сутки, небо градиентное.
6. Призыв существ (макс. 3 активных + 12 в запасе):
   - 6 стихий, 4 редкости
   - Поведение: агрессивный/защитный/поддержка
   - ИИ: follow, автоатака, уклонение от AoE, 
     каст по КД
7. Бой: базовый удар, блок, 1 скилл + ульта, криты, 
   hit-stop, screen shake, floating numbers (пул).
8. Монстры: 6 типов (3 обычных, 2 элиты, 1 босс), 
   патруль, агро, лут, респавн 90с.
9. Прогрессия: уровни 1–30 (кривая level^1.5×100), 
   дерево навыков 3 ветви × 10, уровни Эхо 1–10, 
   эволюция на 5 и 10.
10. Обучение: пошаговое (движение → первое Эхо → 
    бой → призыв → крафт → квест), пропускаемое, 
    с подсветкой UI.
11. Квесты: 3 сюжетных + 5 побочных, диалоги.
12. Сохранение: LocalSaveProvider по умолчанию, 
    FirebaseSaveProvider при включённом флаге.
13. Меню: Новая игра / Продолжить / Настройки / 
    Обучение / Пригласить друга (share).

── ФАЗА 2: Стратегия и развитие ──
1. Формации 3×3 с бонусами по позиции.
2. Синергии стихий (пары, триплеты).
3. Крафт и слияние Эхо (2 × rank N → шанс rank N+1).
4. База-убежище: 5 зданий, улучшения.
5. Арена PvP vs боты: 5 волн, локальный + 
   глобальный лидерборд.
6. Сундуки с анимацией открытия (GSAP).
7. Чат (RTDB, модерация CF).
8. Таблица лидеров (top-100, 2 категории).

── ФАЗА 3: MMO-элементы ──
1. Presence-призраки других игроков в хабе.
2. Ежедневные задания (CF cron).
3. PvP-дуэли (асинхрон + live лобби).
4. Рейд-боссы на выходных (CF event).
5. Гильдии (заглушка + интерфейс).
6. Реакции существ, эмоции, фразы.

═══════════════════════════════════════════════════════════
10. ТРЕБОВАНИЯ К КОДУ
═══════════════════════════════════════════════════════════
- Архитектура: Entity-Component-Lite + системы.
- Typed EventBus (discriminated unions).
- Никаких магических чисел — всё в /data/*.json.
- IOC: ISaveProvider, IAuthService, IHapticService, 
  ILoadingTask — переключение локально/облако.
- LoadingManager: регистрировать задачи (start/complete), 
  веса, статусы, emit прогресс-события.
- README.md: архитектура, схема данных, настройка 
  Firebase, BotFather, деплой Pages + Functions, 
  чек-лист ассетов.
- Все сетевые вызовы в try/catch с toast-уведомлениями.
- В dev — console.log, в prod — сбор критичных ошибок 
  через CF (опционально).
- Бандл MVP < 1.5 MB gzip.

═══════════════════════════════════════════════════════════
11. СХЕМА ДАННЫХ
═══════════════════════════════════════════════════════════
SummonConfig {
  id, name, element, rarity,
  stats: { hp, atk, def, spd, crit },
  abilities: AbilityRef[], passive: PassiveRef,
  modelPath, evolveTo?, lore
}
AbilityRef { id, cooldown, manaCost, castTime, 
  targeting, effects: Effect[] }
Effect { type, value, duration, chance }
MonsterConfig { id, name, tier, element, stats, 
  abilities[], lootTable, aggroRadius, respawnSec, 
  modelPath }
ItemConfig { id, name, rarity, type, stats?, 
  description, iconPath }
QuestConfig { id, giverId, title, description, 
  steps[], rewards[], prerequisites[] }
TelegramUser { tgId, username, firstName, lastName, 
  photoUrl, languageCode }
PlayerSave { version, user, level, xp, skillPoints, 
  skills, summons[], inventory[], quests[], base, 
  stats, settings, lastSavedAt }

═══════════════════════════════════════════════════════════
12. ПРОЦЕСС РАБОТЫ
═══════════════════════════════════════════════════════════
ШАГ 1: Выдай дерево файлов, package.json, vite.config.ts, 
tsconfig.json, firebase.json, firestore.rules, 
database.rules.json, README.md (полный), схемы данных, 
план по фазам с итерациями, пошаговую инструкцию 
настройки BotFather + Firebase.

ШАГ 2 (после «ОК»): Реализация Фазы 1 шаг за шагом:
  a) Bootstrap: Vite + TS + пустая страница на GH Pages
  b) BootScreen с полосой загрузки и mock-этапами 
     (визуал — сразу, до логики)
  c) TelegramBridge + AuthService (mock)
  d) Three.js сцена с примитивами + пресеты качества
  e) Touch-управление + джойстик
  f) Боевая система + VFX + damage numbers
  g) Призыв + ИИ
  h) Монстры + лут
  i) Прогрессия + LocalSave
  j) Firebase auth + Firestore save
  k) BootScreen с реальными этапами (замена моков)
  l) Обучение + квесты
  m) Визуальная полировка: постобработка, transitions, 
     motion UI, cinematic intro
  n) Финальный чек-лист

ШАГ 3: Ассеты — на старте примитивы Three.js 
(Capsule, Box, Sphere), затем замена на бесплатные 
glTF (Kenney, Quaternius). Не блокируйся.

ШАГ 4: Деплой через GH Actions.

Проверка перед сдачей каждой фазы:
☐ BootScreen с полосой прогресса, реальные этапы
☐ Работает в Telegram на iPhone Safari и Android Chrome
☐ 60 FPS на mid, 30+ на low
☐ Визуал соответствует разделу 2 (PBR, bloom, 
  motion UI, transitions)
☐ Haptic на ключевых действиях
☐ BackButton работает
☐ Тема синхронизирована с Telegram themeParams
☐ Бандл < 1.5 MB gzip
☐ Все тексты на русском
☐ Туториал проходится от начала до конца
☐ Ошибки показываются через Telegram.showAlert
☐ Нет console errors

Начни с ШАГА 1. Дождись «ОК» перед реализацией кода.