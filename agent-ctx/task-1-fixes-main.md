# Task: 4 Critical Fixes for mq-player

## Summary

Completed all 4 critical issues for the mq-player music player web app.

## Changes Made

### 1. FIX: Context menu buttons don't work in FullTrackView
- **Root cause**: The desktop dropdown menu was `absolute right-0 top-10 z-[160]` positioned inside a `relative` div that was within the `overflow-hidden` parent wrapper at line 1666. The `overflow-hidden` was clipping the dropdown's interactive area.
- **Fix**: Changed the desktop dropdown from `absolute` to `fixed` positioning. Added a `moreBtnRef` to the MoreVertical button and a `moreMenuPos` state that captures the button's bounding rect when clicked. The dropdown now uses `style={{ top: moreMenuPos.top, right: moreMenuPos.right }}` for precise fixed positioning, bypassing the overflow-hidden clipping entirely.
- **Files changed**: `src/components/mq/FullTrackView.tsx`

### 2. REDESIGN: OnboardingView genre selection
- **Previous design**: Collapsible category cards with genre pills — too complex and cumbersome
- **New design**: Simple Spotify-style visual grid of genre cards
  - All genres shown at once in a `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4` layout
  - Each genre is a rounded card with its category's unique gradient background color
  - Unselected genres have a dark overlay at 55% opacity; selected are fully vibrant
  - Selected genres show a white checkmark badge and glow border
  - Category icon displayed at top of each card, genre name at bottom
  - Removed `expandedCategories` state and `categoryCounts` memo (no longer needed)
  - Added `FLAT_GENRES` memo that flattens `GENRE_TREE` with category gradient info
  - AnimatedWaveform now uses `scaleY` transform instead of `height` for 60fps
- **Files changed**: `src/components/mq/OnboardingView.tsx`

### 3. FIX: SettingsView content cut off by player bar
- **Previous**: `pb-52`/`pb-56` not enough to clear the bottom player bar
- **Fix**: Increased both to `pb-72` for reliable clearance
- **Files changed**: `src/components/mq/SettingsView.tsx`

### 4. UPGRADE: 60fps animation optimizations
- **Canvas visualizations**: Added `willChange: "opacity"` to all canvas elements in PlayerBar and FullTrackView
- **getComputedStyle caching**: Cached accent color reads (which cause forced layout recalculations) in both FullTrackView and PlayerBar canvas draw loops. Instead of reading `getComputedStyle` every frame, now cached and refreshed every 2 seconds via `setInterval`, with proper cleanup
- **CSS gradient animation**: Added `willChange: "background-position"` to the gradient border animation in FullTrackView
- **Background gradient animations**: Added `willChange: "background"` to framer-motion background gradient animations in FullTrackView and OnboardingView
- **AnimatedWaveform**: Changed from `height` animation (not GPU-accelerated) to `scaleY` with `origin-bottom` (GPU-composited transform)
- **Files changed**: `src/components/mq/FullTrackView.tsx`, `src/components/mq/PlayerBar.tsx`, `src/components/mq/OnboardingView.tsx`

## Build Status
- `npx next build` completed successfully with no TypeScript errors
