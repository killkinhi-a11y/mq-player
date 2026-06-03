# Fix 5 Bugs — Work Record

## Summary
Fixed all 5 broken things in the MQ Player project:

### 1. ContextMenu flash/jump fix
- **File**: `src/components/mq/ContextMenu.tsx`
- **Problem**: Menu rendered at raw `{left: x, top: y}` on first render, then `useEffect` would clamp it — causing a visible flash/jump.
- **Fix**: Changed `useEffect` → `useLayoutEffect` for position clamping. `useLayoutEffect` runs before the browser paints, so the user never sees the unclamped position.
- Also removed unused `searchTracks` import.

### 2. Settings style menu animation fix
- **File**: `src/components/mq/SettingsView.tsx`
- **Problem**: Style menu had `animate={{ height: 300, opacity: 1 }}` which clips content to 300px.
- **Fix**: Changed to `animate={{ opacity: 1 }}` (same as theme menu) — no hardcoded height, content flows naturally.

### 3. View transitions fix
- **File**: `src/app/play/page.tsx`
- **Problem**: Directional slide transitions were broken — `useMemo` with `prevViewLevelRef.current` gave wrong direction because refs don't trigger re-renders. `AnimatePresence mode="wait"` with 250ms duration felt sluggish.
- **Fix**: Replaced with simple cross-fade: `opacity: 0 → 1` enter, `opacity: 1 → 0` exit, subtle `y: 8 → 0` reveal. Duration reduced to 150ms. Removed all directional logic, `VIEW_LEVELS`, `prevViewLevelRef`, and `direction` state.

### 4. Tracks auto-play on login fix
- **File**: `src/components/mq/PlayerBar.tsx`
- **Problem**: `loadTrack` function called `audioEl.play()` regardless of `isPlaying` state — tracks would auto-play even when `isPlaying: false`.
- **Fix**: Added `if (useAppStore.getState().isPlaying)` check before every `audioEl.play()` call in `loadTrack`:
  - Demo track section (2 calls)
  - SoundCloud HLS MANIFEST_PARSED handler
  - DRM retry fallback HLS
  - SoundCloud progressive section (2 calls)
  - audioUrl fallback section (2 calls)
  - Local track section (2 calls)
  - Total: ~10 play() calls now guarded with isPlaying check

### 5. Bottom PlayerBar layout improvements
- **File**: `src/components/mq/PlayerBar.tsx`
- **Changes**:
  - Background: `rgba(18,18,22,0.85)` → `rgba(18,18,22,0.92)`
  - Backdrop blur: `blur(60px)` → `blur(20px)`
  - Cover: 42×42 borderRadius 8 → 44×44 borderRadius 12 (rounded-xl)
  - Progress bar: 2px → 3px tall with border-radius
  - Accent top border: gradient improved with 5%/50%/95% stops, opacity 0.5
  - All control icons: 14-15px → 18px (standardized)
  - Button hit targets: w-8 h-8 → w-9 h-9 (36px, closer to 44px touch target)
  - Play/Pause button: 40×40 → 44×44
  - Added dedicated Queue button (ListMusic icon) in right section
  - Right section reorganized: Volume | Like | Queue | More

## TypeScript
All changes compile cleanly with `npx tsc --noEmit` — no errors.
