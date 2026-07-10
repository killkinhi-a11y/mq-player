# MQ Player — Mobile 60fps Optimization Plan

## Goal: Stable 60 FPS on mid-range Android phones (2-4GB RAM)

---

## Phase 1: Rendering optimizations (HIGH IMPACT)

### 1.1 Replace framer-motion with CSS transitions on lists
**Problem:** Framer-motion wraps every animated element in a motion component, adding React reconciliation overhead. Lists with 20+ motion.div rows cause jank on scroll.
**Fix:** Use CSS `transition` + `will-change` instead of `motion.div` for list rows.
- ✅ Done in SearchView (SearchTrackRow uses CSS transitions)
- TODO: Apply to FavoritesView, HistoryView, QueueView track rows

### 1.2 Virtualize long lists
**Problem:** FavoritesView/HistoryView render ALL tracks at once (200+ DOM nodes). Each node has hover handlers, context menu state, etc.
**Fix:** Use IntersectionObserver-based virtualization — only render visible rows + 5 buffer.
- TODO: Create `VirtualList` component, apply to Favorites/History

### 1.3 Reduce backdrop-blur usage
**Problem:** `backdrop-filter: blur()` is extremely expensive on mobile GPUs. Each blurred element adds ~4ms per frame.
**Fix:** Replace `backdrop-blur` with solid `backgroundColor` + opacity on mobile.
- TODO: Add mobile media query that disables blur

### 1.4 Remove willChange abuse
**Problem:** Many elements have `willChange: transform` permanently set, causing GPU memory waste.
**Fix:** Only set `willChange` during active animation, remove after.

---

## Phase 2: Audio engine optimizations (HIGH IMPACT)

### 2.1 Lazy Web Audio init
**Problem:** AudioContext is created on page load, consuming ~10MB RAM even when not playing.
**Fix:** Defer AudioContext creation until first play() call.
- ✅ Partially done (initAudioEngine called on demand)
- TODO: Verify AnalyserNode not created until visualizer visible

### 2.2 Mobile: disable crossfade
**Problem:** Crossfade keeps 2 audio elements loaded simultaneously = 2x memory.
**Fix:** On mobile, use single audio element (no crossfade).
- TODO: Detect mobile in audioEngine, skip crossfade setup

### 2.3 Mobile: disable gapless preload
**Problem:** Gapless preload loads next track audio while current plays = 2x bandwidth + memory.
**Fix:** On mobile, only preload metadata (not full audio).
- ✅ Done (preload="metadata" on mobile)

### 2.4 RAF throttling for progress bar
**Problem:** Progress RAF runs at 60fps, updating DOM text every frame.
**Fix:** Only update DOM when seconds change (1Hz), not every frame.
- ✅ Done (throttled to 1Hz in useAudioEngine)

---

## Phase 3: Network optimizations (MEDIUM IMPACT)

### 3.1 Image lazy loading + sizing
**Problem:** Track covers loaded at full 500x500 even when displayed at 44x44.
**Fix:** Use `srcset` / `sizes` for responsive images, or use SC's `-t50x50` variant for small thumbnails.
- TODO: Add cover size variants based on display size

### 3.2 Debounce search input
**Problem:** Each keystroke triggers a search API call.
**Fix:** Debounce 300ms.
- ✅ Already done (check existing)

### 3.3 Cache recommendations
**Problem:** Recommendations re-fetched on every view switch.
**Fix:** Cache for 5 minutes in memory.
- ✅ Done (cache in fetchRecs)

---

## Phase 4: React optimizations (MEDIUM IMPACT)

### 4.1 Memoize track rows
**Problem:** Parent re-render re-renders all track rows.
**Fix:** `memo()` with custom comparison.
- ✅ Done in SearchView (SearchTrackRow is memo'd)
- TODO: Apply to Favorites/History

### 4.2 Reduce store subscriptions
**Problem:** Each track row subscribes to `currentTrack` (object), causing all rows to re-render on every track change.
**Fix:** Subscribe to `currentTrack?.id` (string primitive) instead.
- ✅ Done in SearchView
- TODO: Verify in other views

### 4.3 Split large components
**Problem:** MessengerView is 1451 lines, re-renders entirely on any state change.
**Fix:** Extract sub-components (MessageBubble, ContactList, ChatInput).

---

## Phase 5: CSS optimizations (LOW IMPACT)

### 5.1 Remove expensive shadows
**Problem:** `box-shadow` with large blur radius is GPU-expensive.
**Fix:** Use simpler shadows on mobile, or remove entirely.

### 5.2 Disable non-essential animations on mobile
**Problem:** Particle effects, animated backgrounds consume GPU.
**Fix:** `prefers-reduced-motion` + mobile detection → disable.

### 5.3 Use transform/opacity only
**Problem:** Animating `width`, `height`, `top`, `left` causes layout thrashing.
**Fix:** Only animate `transform` and `opacity`.

---

## Execution Priority

1. ✅ SearchTrackRow (memo + CSS transitions) — DONE
2. ✅ Mobile audio preload — DONE
3. TODO: Mobile crossfade disable
4. TODO: backdrop-blur mobile disable
5. TODO: VirtualList for Favorites/History
6. TODO: Cover image sizing

---

## Measurement

Use Chrome DevTools → Performance tab → Record on mobile (or throttled desktop):
- Target: <16ms per frame (60fps)
- Watch for: long tasks >50ms, layout thrashing, forced reflows
