# Аудио (этап 10)

Весь звук генерируется кодом: сторонних сэмплов нет, лицензионных вопросов тоже.
`CREDITS.md` упоминает только саму библиотеку воспроизведения (Howler, MIT).

## Формат

- PCM WAV, **mono, 22 050 Hz, 16 бит** — телефонный динамик всё равно режет
  ниже 200 Гц, поэтому «тело» удара держится на 150→58 Гц, а не на 40 Гц.
- 44-байтный заголовок, `encodeWav` / `decodeWav` в `wav.ts` (те же функции
  использует тест, поэтому байты проверяются, а не только длина).
- Все one-shot'ы заканчиваются нулём и fade'ятся 2–10 мс: без этого на
  перезапуске слышен щелчок.
- `ambience.wav` — единственный луп: 3.2 с, хвост кроссфейдится в начало
  (`loopify`), поэтому стыка не слышно.

## Синтез

`synth.ts` — примитивы (все с детерминированным `mulberry32`-рандомом):

| Примитив | Что даёт |
| --- | --- |
| `tone` | детюн-стек осцилляторов, sweep по частоте, фазовый аккумулятор |
| `noise` | one-pole low-pass + HP-остаток (шум удара/шагов) |
| `envelope` | ADSR на normalized time |
| `lowPass` | однополюсный фильтр (сглаживание мастер-шины звука) |
| `reverb` | feedback comb — короткий «каменный» хвост подземелья |
| `normalize` / `fadeEdges` / `mixInto` | уровень, края, наложение слоёв |

`sfx.ts` — каталог `SOUNDS` (19 записей: `id`, `file`, `category`,
`durationSec`, `peak`, `build`). Это **единственный** источник правды для
байтов; рантайм-зеркало (`src/game/audio/soundSet.ts`) добавляет только
микс-политику (gain, retrigger, rate jitter).

## Пайплайн

`npm run assets` (или `npm run assets -- --only=audio`) рендерит все звуки,
валидирует mono / 22 050 Hz / peak ∈ [0.2, 0.999] и пишет `manifest.json` v2:

```json
{ "version": 2, "sampleRate": 22050, "models": [...], "audio": [
  { "id": "hit", "file": "audio/hit.wav", "bytes": 6178, "durationSec": 0.14, "category": "sfx", "peak": 0.4 }
] }
```

Бюджет — **600 kB** на все звуки (guard в `build-assets.ts`, проверка в
`tests/unit/audioSynth.test.ts`). Текущий размер — 508 kB.

## Рантайм

- `AudioManager` — политика: группы `sfx`/`ui`/`ambience`, громкости
  `sfxVolume`/`musicVolume`/`master`, throttle повторов (`retriggerMs`),
  jitter тона шагов, muted на паузе (`suspend`/`resume`).
- `HowlBackend` — единственное место, знающее про Howler; подгружается лениво и
  уходит в WebAudio (не `html5`), чтобы rate-модуляция была точной.
- `loadAudio()` **никогда не отклоняется**: сломанный WebAudio в WebView не
  должен мешать играть, игра просто идёт без звука.
- Сцена ничего не знает про звук: она дёргает `options.onSound(id)`, движок
  превращает это в `audio.playSound(id)`.

## Тесты

- `tests/unit/audioSynth.test.ts` — RIFF-заголовок, 22.05 kHz, детерминизм (два
  рендера байт-в-байт), peak, DC, нулевой хвост, бюджет, совпадение с манифестом
  и с файлами на диске.
- `tests/unit/audioManager.test.ts` — throttle/force/jitter, громкости групп,
  mute, ambience, suspend/resume на фейковом бэкенде (без браузера).
- `tests/e2e/audio.spec.ts` — только smoke: манифест v2 и ни одного 404 на
  `/assets/audio/*`.
