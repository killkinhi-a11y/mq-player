---
name: hooks
description: "Skill for the Hooks area of mq-player. 47 symbols across 18 files."
---

# Hooks

47 symbols | 18 files | Cohesion: 77%

## When to Use

- Working with code in `src/`
- Understanding how useNativePiP, handleMainUnload, close work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/hooks/useNativePiP.ts` | useNativePiP, handleMainUnload, buildPiPHTML, setup, buildState (+4) |
| `src/hooks/use-toast.ts` | genId, addToRemoveQueue, reducer, dispatch, toast (+2) |
| `src/hooks/useGlobalNotifications.ts` | useGlobalNotifications, waitForAuth, playNotifSound, showBrowserNotification, poll (+1) |
| `skills/pdf/scripts/html2poster.js` | resolveChromium, parseArgs, main |
| `src/hooks/useListenSessionSync.ts` | useListenSessionSync, poll, init |
| `src/app/play/page.tsx` | AppShell, fetchSeasonal, renderView |
| `src/components/mq/MessengerView.tsx` | close, connect |
| `src/app/pip/page.tsx` | fmt, PiPPage |
| `src/app/api/messages/sse/route.ts` | start, poll |
| `src/components/mq/ContextMenu.tsx` | ContextMenu, handleAddToPlaylist |

## Entry Points

Start here when exploring this area:

- **`useNativePiP`** (Function) — `src/hooks/useNativePiP.ts:30`
- **`handleMainUnload`** (Function) — `src/hooks/useNativePiP.ts:150`
- **`close`** (Function) — `src/components/mq/MessengerView.tsx:1185`
- **`PiPPage`** (Function) — `src/app/pip/page.tsx:41`
- **`poll`** (Function) — `src/app/api/support/sse/route.ts:54`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useNativePiP` | Function | `src/hooks/useNativePiP.ts` | 30 |
| `handleMainUnload` | Function | `src/hooks/useNativePiP.ts` | 150 |
| `close` | Function | `src/components/mq/MessengerView.tsx` | 1185 |
| `PiPPage` | Function | `src/app/pip/page.tsx` | 41 |
| `poll` | Function | `src/app/api/support/sse/route.ts` | 54 |
| `getActiveTypingForUser` | Function | `src/app/api/messages/typing/route.ts` | 11 |
| `poll` | Function | `src/app/api/messages/sse/route.ts` | 46 |
| `getAudioElement` | Function | `src/lib/audioEngine.ts` | 39 |
| `setup` | Function | `src/hooks/useNativePiP.ts` | 71 |
| `ContextMenu` | Function | `src/components/mq/ContextMenu.tsx` | 16 |
| `handleAddToPlaylist` | Function | `src/components/mq/ContextMenu.tsx` | 89 |
| `reducer` | Function | `src/hooks/use-toast.ts` | 76 |
| `Toaster` | Function | `src/components/ui/toaster.tsx` | 12 |
| `PlaylistView` | Function | `src/components/mq/PlaylistView.tsx` | 15 |
| `applyThemeToDOM` | Function | `src/lib/themes.ts` | 441 |
| `useListenSessionSync` | Function | `src/hooks/useListenSessionSync.ts` | 15 |
| `poll` | Function | `src/hooks/useListenSessionSync.ts` | 29 |
| `init` | Function | `src/hooks/useListenSessionSync.ts` | 185 |
| `useGlobalNotifications` | Function | `src/hooks/useGlobalNotifications.ts` | 9 |
| `waitForAuth` | Function | `src/hooks/useGlobalNotifications.ts` | 16 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AppShell → Close` | cross_community | 7 |
| `FullTrackView → Close` | cross_community | 5 |
| `AppShell → SimulateDecryptSync` | cross_community | 5 |
| `AppShell → ShowBrowserNotification` | cross_community | 5 |
| `PlayerBar → Close` | cross_community | 4 |
| `Setup → CreateAudioElement` | cross_community | 4 |
| `Setup → GetCSSVar` | intra_community | 4 |
| `Draw → CreateAudioElement` | cross_community | 4 |
| `SpatialAudioView → Close` | cross_community | 4 |
| `AppShell → WaitForAuth` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Mq | 6 calls |

## How to Explore

1. `gitnexus_context({name: "useNativePiP"})` — see callers and callees
2. `gitnexus_query({query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
