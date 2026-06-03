# Task: Add Long-Press Support to ContextMenu for Mobile

## Summary
Implemented long-press (touch) support for the MQ Player's ContextMenu component, enabling mobile users to open context menus by holding down on track items.

## Changes Made

### 1. Created `src/hooks/useLongPress.ts`
- Generic, reusable long-press hook supporting both touch and mouse events
- Default delay: 500ms, configurable
- Movement threshold: 10px — cancels long press if finger moves beyond this (prevents scroll interference)
- Calls `e.preventDefault()` on `touchstart` to suppress browser's native long-press context menu
- Manually dispatches synthetic click on `touchend` for short taps (compensates for preventDefault)
- Does NOT call `preventDefault()` on `mousedown` to avoid suppressing normal click events
- Haptic feedback via `navigator.vibrate(10)` when available
- Exposes `wasLongPress()` method for components to check if a long press just occurred (suppresses ghost clicks)
- Proper timer cleanup on unmount

### 2. Updated `src/components/mq/TrackCard.tsx`
- Imported `useLongPress` hook
- Added `handleLongPress` callback that extracts touch/mouse coordinates and opens the context menu
- Applied long press handlers (onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd, onTouchMove) to the track card's motion.div
- Added `select-none` CSS class to prevent text selection during long press
- Modified `handleClick` to check `longPressWasActive()` and return early if a long press just fired
- Existing right-click (`onContextMenu`) and "More" button still work as before

### 3. Updated `src/components/mq/QueueView.tsx`
- Imported `ContextMenu` and `useLongPress`
- Added context menu state (`track`, `x`, `y`, `show`) at the QueueView level
- Rendered `ContextMenu` component in the panel when state is active
- **HistoryTrackItem**: Added `onContextMenu` prop, `useLongPress` hook, `handleRightClick`, `handleClick` with `wasLongPress()` guard
- **UpNextTrackItem**: Added `onContextMenu` prop, `useLongPress` for touch-only handlers, `handleRightClick` — does NOT use mouse long-press to avoid conflicting with drag-and-drop
- **QueueTrackItem**: Added `onContextMenu` prop, `useLongPress` hook, `handleRightClick`, `handleClick` with `wasLongPress()` guard
- All sub-components: Added `select-none` class for text selection prevention during long press

## Key Design Decisions
- **Touch vs Mouse preventDefault**: Only call `e.preventDefault()` on touch start to suppress the browser's native long-press menu. Mouse mousedown is left untouched to preserve click behavior.
- **Synthetic click dispatch**: Since `preventDefault()` on touchstart prevents synthetic click events, the hook manually dispatches a click via `target.click()` on touchend when no long press occurred.
- **wasLongPress() timestamp check**: Uses a 300ms window to detect if a long press just occurred, allowing components to suppress ghost clicks.
- **UpNextTrackItem drag safety**: Only applies touch-based long-press handlers (not mouse) to avoid interference with HTML5 drag-and-drop on desktop.
