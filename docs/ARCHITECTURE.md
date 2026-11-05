# MQ Web architecture (after Stage III)

> Stage III = **controlled decomposition without behaviour change**. No API contracts, DB schema,
> auth flow, persisted formats, playback/queue algorithms or design were changed.

## 1. Store (`src/store/`)

| Before | After |
|---|---|
| `useAppStore.ts` — 4107 lines: types + initial state + 167 actions + persistence | `useAppStore.ts` — 329 lines, **composition root** |

```
src/store/
  useAppStore.ts      composition root: create(persist(...slices)), onRehydrateStorage; re-exports all public types + getLastVolume
  types.ts            AppState + domain types (ViewType, UserPlaylist, PublicPlaylist, …) + StoreSlice<K>
  initialState.ts     single source of initial state (no state is duplicated in slices)
  persist.ts          STORAGE_KEY "mq-store-v8", STORE_VERSION 12, quota-managed storage, partializeState/migrateState/mergeState
  internal/helpers.ts clampNum, estimateTrackEnergy, MAX_HISTORY_ENTRIES, last-volume memory
  slices/             actions grouped by domain (StoreSlice<K> = StateCreator returning Pick<AppState, K>)
    auth (5) · appearance (19) · playback (17) · queue (13) · audio (13) · sleepTimer (3)
    library (24) · discovery (5) · wave (12) · taste (10) · messenger (12) · ui (21)
    social (2) · sync (5) · cat (5)          + root: reset
```

**Rules**
- Components keep importing from `@/store/useAppStore` (109 importers untouched).
- Slices never import `useAppStore` (no cycle) — cross-slice calls go through `get()`.
- Slices contain only actions; state shape lives in `types.ts` + `initialState.ts`.
- Changing what `persist.ts` writes requires bumping `STORE_VERSION` + a migration.

**How it was done:** a TypeScript-AST script moved every action **verbatim** (including comments).
The only rewrites: `useAppStore.getState()` → `get()` inside slices (same store instance), and
`__lastVolume = v` → `rememberLastVolume(v)`.

**Guards**
- `__tests__/store/store-shape.characterization.test.ts` — snapshot committed *before* the split: all keys and value kinds, initial values, persist name and version, `partialize` output for a populated state, `migrate` output for a v9 payload. Unchanged after the split.
- `__tests__/store/slices.test.ts` — slices are disjoint and cover every action, and no slice redefines a state key. Cross-slice tests: upNext → nextTrack, setVolume → last-volume memory, like + queue ops, logout resets other slices, root reset.

## 2. Large views (`src/components/mq/`)

| View | Before | After | Extracted to |
|---|---:|---:|---|
| MainView | 2683 | 1013 | `main/` — HomeHero, QuickActions, TrackRows, RecommendedPlaylists, homeUtils |
| SearchView | 2472 | 1642 | `search/` — SearchTrackRow, SearchSuggestions, TopResultCard, DiscoveryFeaturedCard, constants, matching, searchHistory; `lib/localBlobUrls.ts` |
| MessengerView | 2683 | 2257 | `messenger/` — types, constants, format, parts, **messengerApi** (service), **usePinnedChats**, **useVoiceRecorder** |
| AuthView | 2386 | 1949 | `auth/` — validation, redirect, types, AuthLayout, CodeBoxes, AuthIcons, **authApi** (service) |

- Sub-components and pure helpers were moved **verbatim**. This was checked by comparing every non-import line before and after: Main 2533/2533, Search 2313/2314 (one comment above an import that was merged), Messenger 2542/2542, Auth 2220/2220.
- Previously exported names are re-exported from the original files (`waveReasonText`, `getLocalBlobUrl`, `registerLocalBlobUrl`).
- Layering: UI → hooks (`use*`) → services (`*Api.ts`) → `fetch`. Services keep endpoints, params and response handling unchanged.
- Source-contract tests (they grep component source) now read "entry file + its feature folder" via `__tests__/helpers/readModuleSource.ts`, so they keep checking the same code.

## 3. Dependencies

| Check | Before (Stage II) | After |
|---|---|---|
| Circular imports (`madge --circular src`) | 8 | **7** |

Removed: `lib/download/providers → components/mq/SearchView → … → DownloadMenu → lib/download`.
`lib/download`, `lib/waveform/generator` and `useAudioEngine` no longer import a UI component.

Remaining cycles (pre-existing, outside the scope of this stage): `lib/wave/{types,relevance,scoring,memory,profile,events}` (6 chains) and `lib/playback/fullLength ↔ resolver`.

## 4. Known remaining problems (proposed follow-up stages)

1. **View bodies are still large.** `MessengerView` has about 2.2k lines in one component: around 45 `useState`, SSE, BroadcastChannel, group polling and send pipelines. Next step: `useMessengerRealtime` (SSE + BC), `useGroupChats`, `useSendMessage`, plus list and chat panes as components. This needs RTL/e2e coverage first, because `@testing-library/react` is not installed and there are no Messenger interaction tests.
2. **`AuthView` step machine** (about 1.9k lines, about 60 `useState`). Proposal: a `useAuthFlow` reducer per step (email, Telegram bot, Telegram widget, forgot password), with existing API calls moved into `auth/authApi.ts`. Auth is a sensitive area and needs its own PR and review.
3. **`AppState` is still one interface.** Next step: a `*State` interface per slice, merged into `AppState`, and selectors per domain.
4. **About 900 `useAppStore.getState()` calls outside the store** (imperative access from components and libs). These are candidates for domain services/selectors.
5. **The `lib/wave` type cycle**: `types.ts` imports runtime from `relevance.ts`. Fix by moving shared types to `wave/types` without runtime imports.
6. **Cross-platform duplication** (queue, models, WAVE between Web, Android and Tauri) is planned for the mq-core stage (Rust), and was not touched here.
7. **CI "Lint & Type-Check" is red on `main`.** `tsc --noEmit` at the root includes `desktop/` (Tauri dependencies are not installed by the root `npm ci`), `scripts/` and `skills/`: 19 errors, all pre-existing. Proposal: exclude `desktop/` and `skills/` from the root tsconfig and type-check `desktop/` in its own job (`cd desktop && npm ci && npx tsc --noEmit`).

## 5. Checks that cannot be run in the agent sandbox

| Platform | Command | Status |
|---|---|---|
| Rust audio workspace | `cd audio-engine && cargo test --workspace` | not run: no Rust toolchain (this stage made no Rust changes) |
| Android | `cd android && ./gradlew testDebugUnitTest` | not run: no Android SDK (no Android changes) |
| Desktop (Tauri) | `cd desktop && npm ci && npx tsc --noEmit && npm run tauri build` | not run: no Windows/Tauri toolchain (only 2 lint fixes in `desktop/`, in PR #1) |
| Web UI by hand | `npm run dev`, then go through Home, Search (typing, suggestions, history), Messenger (DM, group, pin, voice), Auth (all steps) | not done: needs a browser and real accounts |
