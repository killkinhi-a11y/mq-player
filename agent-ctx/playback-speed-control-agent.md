# Playback Speed Control Implementation

## Task ID: playback-speed-control
## Agent: Main Agent
## Status: Completed

## Summary
Added playback speed control (0.5x – 2.0x) to the MQ Player project with full persistence and cross-component synchronization.

## Changes Made

### 1. `src/lib/audioEngine.ts`
- Added `setAudioPlaybackRate(rate: number)` function
- Clamps rate between 0.25 and 3.0
- Sets `playbackRate` on both `_audioA` and `_audioB` audio elements (for crossfade sync)

### 2. `src/store/useAppStore.ts`
- Added `playbackRate: number` (default 1.0) to state interface
- Added `setPlaybackRate: (rate: number) => void` action
- Action clamps rate (0.25–3.0), sets state, and calls `engineSetAudioPlaybackRate`
- Added `playbackRate` to `partialize` for localStorage persistence
- Imported `setAudioPlaybackRate as engineSetAudioPlaybackRate` from audioEngine

### 3. `src/components/mq/PlayerBar.tsx`
- Added `Gauge` icon import from lucide-react
- Added `setAudioPlaybackRate` import from audioEngine
- Destructured `playbackRate` and `setPlaybackRate` from store
- Added `showSpeedMenu` state and `speedMenuRef` ref
- Added outside-click handler to close speed menu
- Added `useEffect` to re-apply `playbackRate` when track changes
- Fixed `playbackRate` in MediaSession position state (was hardcoded to 1)
- Added Speed Control button + dropdown in controls cluster (after Like button):
  - Gauge icon with badge showing current rate when ≠ 1.0
  - Dropdown with options: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 1.75x, 2.0x
  - Active rate highlighted with accent color and dot indicator
  - Glassmorphism dark theme styling matching existing UI
  - Framer Motion animations for dropdown open/close

### 4. `src/components/mq/FullTrackView.tsx`
- Replaced local `playbackSpeed` useState with store `playbackRate`/`setPlaybackRate`
- Added 1.75x speed option to PLAYBACK_SPEEDS array
- Updated `cyclePlaybackSpeed` to use store `setPlaybackRate` (audioEngine called automatically by store action)
- Updated track change effect to re-apply stored rate instead of resetting to 1.0
- Replaced all `playbackSpeed` references with `playbackRate`

## Key Design Decisions
- Store-level state ensures PlayerBar and FullTrackView stay in sync
- Persistence via Zustand middleware survives page reloads
- Rate is re-applied on track change via useEffect (audio elements may be swapped during crossfade)
- Both audio elements (A & B) get rate applied for seamless crossfade transitions
- Clamping at 0.25–3.0 provides safety while 0.5–2.0 is the user-facing range
