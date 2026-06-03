# Gapless Playback Implementation — Task Summary

## Task ID: gapless-playback
## Agent: main

## What was implemented

### 1. audioEngine.ts — Gapless functions added
- `setGaplessEnabled(enabled)` / `isGaplessEnabled()` — toggle gapless mode (default: enabled)
- `setGaplessPreloadedTrackId(trackId)` / `getGaplessPreloadedTrackId()` — track which track was preloaded
- `clearGaplessPreload()` — reset the inactive element and preload state
- `preloadTrack(audioUrl, trackId)` — load a track into the inactive audio element (calls `load()`, not `play()`)
- `crossfadeToGapless(newAudio)` — instant crossfade with 0.1s fade (vs normal 2s) for seamless transitions
- Reset state in `destroyAudioEngine()`

### 2. useAppStore.ts — Gapless state and actions
- Added `gaplessEnabled: boolean` (default `true`) to state — persisted via existing middleware
- Added `setGaplessEnabled(enabled)` action
- Added `peekNextTrack()` action — returns the next track that would play without changing state
  - Respects upNext priority, normal queue order, repeat modes
  - Returns `null` for shuffle mode (non-deterministic), repeat "one", or empty queue

### 3. PlayerBar.tsx — Gapless preload and transition logic
- Added `gaplessPreloadStartedRef` and `gaplessPreloadedTrackRef` refs
- Added `gaplessPreloadNextTrack()` callback — resolves stream URL and loads next track into inactive element
  - Handles demo tracks, SoundCloud streams (progressive + HLS), and local files
  - Properly sets up HLS.js with EME for encrypted streams
  - Routes SC CDN URLs through proxy
  - Validates that the current track hasn't changed during async resolution
- In `onTimeUpdate`: when track has ≤10s remaining and gapless enabled, preloads the next track
  - Invalidates preload if the next track changes (queue modified)
- In `loadTrack`: checks if the new track was preloaded
  - If preloaded: does instant crossfade via `crossfadeToGapless()` and skips normal loading
  - If not preloaded: clears preload state and loads normally
- Clears preload when user manually changes tracks (track ID doesn't match preloaded)

### 4. SettingsView.tsx — Gapless toggle in settings
- Added "Непрерывное воспроизведение" (Gapless Playback) toggle
- Uses `AudioWaveform` icon, placed in the Воспроизведение (Playback) section after Crossfade
- Toggle calls both `setGaplessEnabled` (store) and `engineSetGaplessEnabled` (audioEngine)
- Shows "ВКЛ" / "ВЫКЛ" value label

## Files modified
- `src/lib/audioEngine.ts`
- `src/store/useAppStore.ts`
- `src/components/mq/PlayerBar.tsx`
- `src/components/mq/SettingsView.tsx`

## Build status
- TypeScript: passes `tsc --noEmit`
- Next.js build: succeeds with no errors (only pre-existing warnings)
