# shared/ — cross-platform contracts and fixtures

Single source of truth for data shapes and behaviour rules that the web app
(`src/`) and the Android app (`android/`) must agree on.

| Path | What |
|---|---|
| `contracts/*.contract.json` | Data contracts (fields, types, enums, defaults, id rules). Versioned by `version`. |
| `test-fixtures/*.cases.json` | Golden cases: `{ id, description, input, expected }`, file-level `contract` + `contractVersion`. |

Both platforms run the **same** fixture files:

- web: `src/__tests__/contracts/*.test.ts` (validator `src/lib/contracts/validate.ts`);
- Android: `android/app/src/test/kotlin/com/mq1/player/contracts/*` (validator
  `data/contracts/ContractValidator.kt`). Gradle adds `shared/` as a unit-test
  resource dir, so files are read from the classpath (`contracts/…`, `test-fixtures/…`).

Rules:

1. Change the contract → bump `version` if a field is removed/retyped; adding an
   optional field keeps the version.
2. Every contract field must exist in the web `Track` type **and** the Kotlin
   `Track` model — both test suites assert the field sets are equal.
3. Add a fixture case for every bug found in cross-platform data handling.
4. Error codes are `<field>:<rule>` and must be identical on both platforms.
5. CI: changes under `shared/**` trigger web, desktop and Android jobs.

## Fixture index

| Fixture | Web | Android |
|---|---|---|
| `track.cases.json` | `src/lib/contracts/track.ts` | `data/contracts/ContractValidator.kt` + `data/api/Models.kt` |
| `sync-merge.cases.json` | `src/lib/sync/merge.ts` (store `syncFromServer`) | `data/sync/SyncMerge.kt` (used by `SyncRepository`) |
| `wave-signals.cases.json` | `src/lib/wave/signals.ts` (useWaveEngine) | `data/wave/WaveSignalsBuilder.kt` (WaveRepository → POST /api/wave) |
| `wave-palette.cases.json` | `src/components/mq/wave-ambient-palette.ts` | `ui/wave/WavePalette.kt` (WaveAmbientBackdrop) |
| `../design/themes.json` | generated from `src/lib/themes.ts` (`npx tsx scripts/gen-theme-tokens.mts`) | generated block in `ui/theme/MqThemes.kt` |
| `queue.cases.json` | `src/lib/core/queue.ts` (used by store `nextTrack`/`prevTrack`/persist) | `player/QueueRules.kt` (used by `PlaybackController`) |

Queue semantics (both platforms): Next → index+1, wraps only with repeat
`all`; repeat `one` replays on track end, manual Next still advances; broken
items are skipped without wrapping when repeat is `off`; Previous restarts
after 3 s, at the first item wraps only with repeat `all`; play-next is FIFO;
the persisted queue is a ≤50-item window that contains the current track and is
restored paused. Shuffle order itself is platform-specific (web random pick /
Media3 permutation).

Sync (`/api/sync`): the server is per-key last-write-wins, so every client
pulls → merges (shared rules) → pushes. Android syncs `likedTracks`,
`likedTracksData`, `dislikedTracks`, `dislikedTracksData`, `history` only (never
`playlists` / `settings`), pushes only keys whose id lists changed, never pushes
without a successful pull in the same cycle, keeps tombstones for local
un-likes until a successful push, skips demo/logged-out users, retries
IO/5xx with 1 s/2 s backoff, stops on 401/403 and malformed payloads.
Known limitation (both platforms): clearing history or un-liking on the WEB is
still undone by the union merge on the next pull — the web store does not
record tombstones yet.

WAVE / themes: `wave-signals` and `wave-palette` expected values were
generated once from the web implementation (the web is the reference); they
lock the web behaviour and force the Kotlin ports to match. Theme tokens:
edit `src/lib/themes.ts`, then run `npx tsx scripts/gen-theme-tokens.mts`
(`--check` to verify) — tests fail on either platform if the JSON or the
Kotlin block drift.
