"use client";

import { useRef, useCallback } from "react";

interface UseLongPressOptions {
  /** Time in ms before the long press triggers. Default: 500 */
  delay?: number;
  /** Max distance in px the pointer can move before cancelling. Default: 10 */
  threshold?: number;
  /**
   * Called on short tap (touchend before long-press timer fires).
   * This replaces the unreliable synthetic click dispatch.
   * If not provided, the native click event is allowed to fire.
   */
  onShortPress?: () => void;
}

interface UseLongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  /**
   * Returns true if a long press recently occurred (within the last 300ms).
   * Use this in onClick handlers to suppress the click that follows a long press.
   *
   * @example
   * const longPress = useLongPress(callback);
   * <div onClick={(e) => { if (longPress.wasLongPress()) return; doSomething(); }} />
   */
  wasLongPress: () => boolean;
}

/**
 * Generic long-press hook that works with both touch and mouse events.
 *
 * - Triggers `callback` after holding for `delay` ms.
 * - Cancels if the pointer moves more than `threshold` px (prevents scroll interference).
 * - Provides haptic feedback via `navigator.vibrate` when available.
 * - Exposes `wasLongPress()` to help consuming components suppress click events
 *   that would otherwise fire after a long press on touch devices.
 *
 * FIX: When `onShortPress` is provided, it's called directly on short tap instead of
 * dispatching a synthetic `target.click()` via setTimeout. The old approach was unreliable
 * in React 19 — the synthetic click could fail to trigger React's onClick handler, causing
 * the "double-click" bug where the first tap didn't register.
 *
 * Note: Consuming components should:
 * 1. Use `select-none` CSS class to prevent text selection during long press.
 * 2. Use `onContextMenu` with `e.preventDefault()` to prevent the native context menu.
 * 3. Check `wasLongPress()` in their `onClick` handler to skip clicks after long presses.
 */
export function useLongPress(
  callback: (e: React.TouchEvent | React.MouseEvent) => void,
  options: UseLongPressOptions = {}
): UseLongPressHandlers {
  const { delay = 500, threshold = 10, onShortPress } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimestampRef = useRef<number>(0);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      // On touch, prevent default to suppress the browser's native long-press
      // context menu. This also prevents the synthetic click event.
      // When onShortPress is provided, we call it directly on touchend instead
      // of dispatching a synthetic click (which is unreliable in React 19).
      // When onShortPress is NOT provided, we still dispatch target.click()
      // as a fallback for backward compatibility.
      if ("touches" in e) {
        e.preventDefault();
      }

      longPressTimestampRef.current = 0;

      let clientX: number;
      let clientY: number;

      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        longPressTimestampRef.current = Date.now();

        // Haptic feedback if available
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(10);
          } catch {
            // Vibration not supported or denied
          }
        }

        callback(e);
        clear();
      }, delay);
    },
    [callback, delay, clear]
  );

  const move = useCallback(
    (e: React.TouchEvent) => {
      if (startPosRef.current === null) return;

      const touch = e.touches[0];
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;

      if (Math.sqrt(dx * dx + dy * dy) > threshold) {
        clear();
      }
    },
    [threshold, clear]
  );

  const touchEnd = useCallback(
    (e: React.TouchEvent) => {
      // If no long press occurred and we prevented default on touchstart
      if (
        longPressTimestampRef.current === 0 &&
        startPosRef.current !== null
      ) {
        // The long press timer hasn't fired, so this was a short tap.
        if (onShortPress) {
          // Direct callback — reliable, no setTimeout, no synthetic click
          onShortPress();
        } else {
          // Fallback: dispatch synthetic click for backward compatibility
          // This is the old approach that can fail in React 19
          const target = e.currentTarget as HTMLElement;
          if (target) {
            setTimeout(() => {
              target.click();
            }, 0);
          }
        }
      }
      clear();
    },
    [clear, onShortPress]
  );

  const mouseUp = useCallback(() => {
    clear();
  }, [clear]);

  const mouseLeave = useCallback(() => {
    clear();
  }, [clear]);

  const wasLongPress = useCallback(() => {
    return Date.now() - longPressTimestampRef.current < 300;
  }, []);

  return {
    onMouseDown: start as (e: React.MouseEvent) => void,
    onMouseUp: mouseUp,
    onMouseLeave: mouseLeave,
    onTouchStart: start as (e: React.TouchEvent) => void,
    onTouchEnd: touchEnd,
    onTouchMove: move,
    wasLongPress,
  };
}
