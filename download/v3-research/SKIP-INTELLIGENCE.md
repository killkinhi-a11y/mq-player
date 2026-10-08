# MQ V3 — SKIP INTELLIGENCE REPORT (PHASE 41)

Дата: 2026-10-08 · Модуль: `src/lib/listening/skipIntelligence.ts` + интеграция store

## Event model (§24 — все поля)

```ts
SkipEventV3 {
  trackId, artistId, albumId, provider, catalogProvider, playbackProvider,
  startedAt, skippedAt, playedSeconds, duration, completionRatio,
  skipPosition, artist, genre, versionTag,
  kind: "skip" | "complete" | "replay" | "favorite" | "unfavorite"
}
```

Запись событий — для ВСЕХ воспроизведений (не только wave-radio):
- `playTrack` со сменой трека mid-play → skip (≥1s, <90% listened)
- `nextTrack`/`prevTrack` → skip через recordSkipFromTransition
- natural end → complete (движок, как раньше)
- рестарт после завершения → replay
- лайк/анлайк → favorite/unfavorite
- Media Session skip + wave-radio skip → через recordSkip (легаси-путь
  теперь тоже пишет V3-событие)

Хранение: localStorage ring buffer `mq:v3:listeningEvents` (500 событий),
рехидрация в store при старте + производный `skipProfile`.

## Weights (§25 — секунды, не фракции)

| Сигнал | Вес |
|---|---|
| skip < 10s | −1.0 strong negative |
| 10–30s | −0.7 negative |
| 30–60s | −0.45 moderate negative |
| ≥60% listened | −0.25 weak negative |
| ≥90% listened | −0.1 almost neutral |
| 100% (complete) | +0.5 positive |
| replay | +0.8 strong positive |
| favorite | +1.0 very strong positive |
| unfavorite | −0.6 |

## Time decay (§25)

Экспоненциальный: weight × 0.5^(age / 14 дней). Старые скипы теряют
вес: 14 дней → ×0.5, 28 → ×0.25, 6 полужизней → следы <5%.

## Channelled profile (§26 — «артист положительный, стиль отрицательный»)

Каналы: artists / genres / styles / tracks. Канальное разделение:
skip с versionTag (live/acoustic/slowed/…) бьёт по СТИЛЮ (×0.9) и почти
не трогает артиста (×0.15) — пользователь отверг вариант, не артиста.
Untagged skip — по артисту ×0.5.

Тест-доказательство (юнит): Travis Scott — 2 complete + favorite
плюс 2 ранних скипа acoustic/live версий → `artists["travis scott"] > 0`,
`styles.acoustic < −0.8`, `styles.live < −0.8`. Ровно сценарий §26.

## Recommendations integration (§26)

`skipScoreAdjustment(candidate, profile, {discovery})`:
- негативные каналы давят кандидата вниз (artist ×3, genre ×2, style ×3)
- позитивный artist pull масштабируется (1−discovery) — знакомство против
  исследования
- используется в smart queue ранкinge (ниже) и готов для расширения
  в wave/relevance

## Smart queue (§27)

Конец очереди (не radio, не repeat): `refillQueueSmart()` —
- сид: текущий SC-трек (или последний из истории с SC id)
- сигналы: historyScIds (80), skippedArtists/Genres (профиль §26, порог
  −0.25), likedArtists/Genres (+0.2)
- кандидаты: /api/music/radio → фильтр (dupes, dislikes) → рантинг
  `skipScoreAdjustment − diversity-penalty + ε`
- автопродолжение: остановились на конце → свежие треки → авто-advance
- honest: нет сида/сети → обычный стоп (никакого зависающего «playing»)
- UI-тумблер: Настройки → Звук → Переходы → «Умное продолжение очереди»

«A skip, B skip, C skip → не предлагать D почти такой же»: негативный
artist/style-канал занижает near-identical D (юнит-тест подтверждает
D < −1.0 vs E = 0 для разных артистов).

## Tests (22 новых)

Классификация всех §25-бакетов, веса таблицы, decay 14/28 дней,
канальный профиль (§26-сценарий), smart-queue ранжирование, полнота §24
полей, ring buffer, honest null на неизмеримых сигналах.
Плюс v3-test-matrix: живой прогон через реальный store — rapid
A→B→C→D записал skip-события для A/B/C (5s/8s/7s), near-complete
переключения НЕ записались как skip (нет двойного счёта с complete).

Production QA: `mq:v3:listeningEvents` заполняется на живом проде
(skip:30s, complete:30s в короткой сессии).
