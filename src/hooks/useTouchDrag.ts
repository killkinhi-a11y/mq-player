"use client";

import { useRef, useState, useCallback, useEffect } from "react";

/**
 * useTouchDrag — touch-friendly drag & drop for list reordering.
 *
 * Problem: HTML5 drag events (draggable, onDragStart, onDrop) don't fire on
 * touch devices. iOS Safari and Android Chrome ignore them entirely.
 * This hook provides a touch-based alternative using touchstart/move/end
 * with a long-press activation (500ms) to distinguish from scrolling.
 *
 * Usage:
 * const { isDragging, dragIndex, handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchDrag({
 *   onReorder: (fromIndex, toIndex) => { ... },
 *   itemCount: tracks.length,
 *   itemHeight: 56, // approximate row height
 * });
 *
 * <div
 *   onTouchStart={handleTouchStart(i)}
 *   onTouchMove={handleTouchMove}
 *   onTouchEnd={handleTouchEnd}
 * >
 *   Track {i}
 * </div>
 */

interface UseTouchDragOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemCount: number;
  itemHeight?: number;
  longPressDelay?: number;
  moveThreshold?: number;
}

interface TouchDragState {
  fromIndex: number;
  toIndex: number;
  startY: number;
  currentY: number;
  isLongPress: boolean;
}

export function useTouchDrag({
  onReorder,
  itemCount,
  itemHeight = 56,
  longPressDelay = 500,
  moveThreshold = 10,
}: UseTouchDragOptions) {
  const [dragState, setDragState] = useState<TouchDragState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<TouchDragState | null>(null);

  // Keep ref in sync for use in event handlers
  useEffect(() => {
    stateRef.current = dragState;
  }, [dragState]);

  const handleTouchStart = useCallback((index: number) => (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const startY = e.touches[0].clientY;

    const state: TouchDragState = {
      fromIndex: index,
      toIndex: index,
      startY,
      currentY: startY,
      isLongPress: false,
    };

    // Start long-press timer
    timerRef.current = setTimeout(() => {
      state.isLongPress = true;
      setDragState({ ...state });
      setDragIndex(index);
      setHoverIndex(index);
      // Haptic feedback
      try { navigator.vibrate?.(30); } catch {}
    }, longPressDelay);
  }, [longPressDelay]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;
    if (!state || !state.isLongPress) {
      // If moved before long-press, cancel it (user is scrolling)
      if (state && timerRef.current) {
        const dy = Math.abs(e.touches[0].clientY - state.startY);
        if (dy > moveThreshold) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
          stateRef.current = null;
        }
      }
      return;
    }

    // Prevent scrolling while dragging
    e.preventDefault();

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - state.startY;
    const indexDelta = Math.round(deltaY / itemHeight);
    const newIndex = Math.max(0, Math.min(itemCount - 1, state.fromIndex + indexDelta));

    state.currentY = currentY;
    state.toIndex = newIndex;

    if (newIndex !== state.fromIndex) {
      setHoverIndex(newIndex);
    }
  }, [itemCount, itemHeight, moveThreshold]);

  const handleTouchEnd = useCallback(() => {
    // Clear long-press timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const state = stateRef.current;
    if (state && state.isLongPress && state.fromIndex !== state.toIndex) {
      onReorder(state.fromIndex, state.toIndex);
      try { navigator.vibrate?.(20); } catch {}
    }

    setDragState(null);
    setDragIndex(null);
    setHoverIndex(null);
    stateRef.current = null;
  }, [onReorder]);

  return {
    dragIndex,
    hoverIndex,
    isDragging: dragState?.isLongPress ?? false,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
