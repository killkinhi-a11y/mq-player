# Task 5: Fix Playback - Add MediaSession API, demo tracks, seek improvements

## Work Completed

### 1. Track Type Extended
- `src/lib/musicApi.ts`: Extended `Track.source` from `"soundcloud" | "local"` to `"soundcloud" | "local" | "demo"`

### 2. Demo Tracks Created
- `src/lib/demoTracks.ts`: New file with 5 demo tracks using SoundHelix CC0 MP3 URLs
  - demo-1: Chill Lo-Fi Beat (lo-fi)
  - demo-2: Ambient Dreams (ambient)
  - demo-3: Electronic Pulse (electronic)
  - demo-4: Jazz Evening (jazz)
  - demo-5: Rock Energy (rock)

### 3. MediaSession API Added
- `src/components/mq/PlayerBar.tsx`: Added useEffect for MediaSession API
  - Sets metadata (title, artist, album, artwork) when currentTrack changes
  - Registers action handlers: play, pause, previoustrack, nexttrack, seekto, seekbackward, seekforward, stop
  - Does NOT duplicate setPositionState (already handled in onTimeUpdate)

### 4. Demo Track Playback
- `src/components/mq/PlayerBar.tsx`: Added demo track branch in loadTrack function
  - Plays directly from `audioUrl` without SoundCloud resolution
  - Connects to Web Audio for visualization
  - Supports crossfade
  - Inserted before SoundCloud branch check

### 5. Demo Login Loads Tracks
- `src/components/mq/AuthView.tsx`: handleDemoLogin now loads demo tracks into store
  - Uses dynamic import of DEMO_TRACKS
  - Sets queue, currentTrack, queueIndex after 500ms delay

### 6. Source Label
- `src/components/mq/SongDNA.tsx`: Added "demo" → "Демо" (purple #a78bfa) in getSourceLabel

## Verification
- TypeScript type check: zero errors (tsc --noEmit)
