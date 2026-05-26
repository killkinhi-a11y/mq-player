---
name: mq
description: "Skill for the Mq area of mq-player. 219 symbols across 35 files."
---

# Mq

219 symbols | 35 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how getEncryptionStatus, MessengerView, check work
- Modifying mq-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/mq/MessengerView.tsx` | getDateLabel, formatLastSeen, formatRecordingTime, MessengerView, check (+37) |
| `src/components/mq/PlayerBar.tsx` | PlayerBar, addListeners, removeListeners, destroyHls, getActive (+12) |
| `src/lib/spatialAudio.ts` | lerp, easeInOutCubic, cloneBands, initSpatialAudio, enableSpatialAudio (+8) |
| `src/components/mq/TrackCanvas.tsx` | bandAverage, drawIpodCanvas, drawJapanCanvas, drawSwagCanvas, drawNeonCanvas (+8) |
| `src/lib/audioEngine.ts` | getAnalyser, getAudioContext, getFrequencyData, createAudioElement, getInactiveAudio (+5) |
| `src/components/mq/OnboardingView.tsx` | OnboardingView, handleLoadMore, renderGenresStep, renderArtistsStep, renderDiscoverStep (+5) |
| `src/components/mq/SongDNA.tsx` | getGenreDisplay, estimateBPM, getSourceLabel, formatTime, SongDNA (+3) |
| `src/components/mq/SettingsView.tsx` | SettingsView, countAudio, apply, handleAccentChange, handleSendSupport (+3) |
| `src/components/mq/MainView.tsx` | getGreeting, getGreetingSubtext, detectLang, MainView, timeDecay (+3) |
| `src/components/mq/AuthView.tsx` | AuthView, fetchBotInfo, handleTgCodeInput, handleTgCodeKeyDown, handleTgCodePaste (+2) |

## Entry Points

Start here when exploring this area:

- **`getEncryptionStatus`** (Function) — `src/lib/crypto.ts:33`
- **`MessengerView`** (Function) — `src/components/mq/MessengerView.tsx:170`
- **`check`** (Function) — `src/components/mq/MessengerView.tsx:581`
- **`fetchStories`** (Function) — `src/components/mq/MessengerView.tsx:589`
- **`updateTitle`** (Function) — `src/components/mq/MessengerView.tsx:695`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getEncryptionStatus` | Function | `src/lib/crypto.ts` | 33 |
| `MessengerView` | Function | `src/components/mq/MessengerView.tsx` | 170 |
| `check` | Function | `src/components/mq/MessengerView.tsx` | 581 |
| `fetchStories` | Function | `src/components/mq/MessengerView.tsx` | 589 |
| `updateTitle` | Function | `src/components/mq/MessengerView.tsx` | 695 |
| `fetchGroups` | Function | `src/components/mq/MessengerView.tsx` | 785 |
| `poll` | Function | `src/components/mq/MessengerView.tsx` | 875 |
| `sendHeartbeat` | Function | `src/components/mq/MessengerView.tsx` | 925 |
| `fetchCount` | Function | `src/components/mq/MessengerView.tsx` | 1003 |
| `fetchStatuses` | Function | `src/components/mq/MessengerView.tsx` | 1020 |
| `pushNowPlaying` | Function | `src/components/mq/MessengerView.tsx` | 1109 |
| `fetchFriendNowPlaying` | Function | `src/components/mq/MessengerView.tsx` | 1142 |
| `handleInputChange` | Function | `src/components/mq/MessengerView.tsx` | 1213 |
| `handleMentionSelect` | Function | `src/components/mq/MessengerView.tsx` | 1236 |
| `handleSearchResultClick` | Function | `src/components/mq/MessengerView.tsx` | 1344 |
| `handleSendSticker` | Function | `src/components/mq/MessengerView.tsx` | 1369 |
| `handleClearHistory` | Function | `src/components/mq/MessengerView.tsx` | 1407 |
| `handleDeleteChat` | Function | `src/components/mq/MessengerView.tsx` | 1449 |
| `sendFriendRequest` | Function | `src/components/mq/MessengerView.tsx` | 1590 |
| `handleFriendRequest` | Function | `src/components/mq/MessengerView.tsx` | 1601 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FullTrackView → Close` | cross_community | 5 |
| `SpatialAudioView → EaseInOutCubic` | intra_community | 5 |
| `SpatialAudioView → Lerp` | intra_community | 5 |
| `AppShell → SimulateDecryptSync` | cross_community | 5 |
| `PlayerBar → Close` | cross_community | 4 |
| `Setup → CreateAudioElement` | cross_community | 4 |
| `FullTrackView → StopAnimation` | cross_community | 4 |
| `Draw → CreateAudioElement` | cross_community | 4 |
| `SpatialAudioView → GetAudioContext` | intra_community | 4 |
| `SpatialAudioView → GetAnalyser` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 14 calls |
| Cluster_18 | 3 calls |
| [id] | 2 calls |
| Cluster_17 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getEncryptionStatus"})` — see callers and callees
2. `gitnexus_query({query: "mq"})` — find related execution flows
3. Read key files listed above for implementation details
