"use client";

import { useState, useCallback, useRef } from "react";
import { useLongPress } from "@/hooks/useLongPress";
import { type Track } from "@/lib/musicApi";

/**
 * useTrackContextMenu — reusable hook for adding right-click + long-press
 * context menu to any track row/card.
 *
 * Returns:
 *   - contextMenu: { track, x, y, show } state
 *   - handlers: spread onto the track element (onContextMenu, onMouseDown, etc.)
 *   - closeContextMenu: closes the menu
 *   - ContextMenuPortal: render this where you want the menu to appear
 *
 * Usage:
 *   const { handlers, contextMenu, closeContextMenu, ContextMenuPortal } = useTrackContextMenu();
 *   <div {...handlers} onClick={...}>...</div>
 *   <ContextMenuPortal />
 */

interface ContextMenuState {
  track: Track | null;
  x: number;
  y: number;
  show: boolean;
}

export function useTrackContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    track: null,
    x: 0,
    y: 0,
    show: false,
  });

  const openAt = useCallback((track: Track, x: number, y: number) => {
    setContextMenu({ track, x, y, show: true });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, show: false }));
  }, []);

  // Long-press handler (mobile)
  const handleLongPress = useCallback((track: Track, e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    openAt(track, clientX, clientY);
  }, [openAt]);

  // Right-click handler (desktop)
  const handleContextMenu = useCallback((track: Track, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openAt(track, e.clientX, e.clientY);
  }, [openAt]);

  // More-button click (3-dot) — opens at button position
  const handleMoreClick = useCallback((track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openAt(track, rect.left, rect.bottom + 4);
  }, [openAt]);

  return {
    contextMenu,
    closeContextMenu,
    handleContextMenu,
    handleLongPress,
    handleMoreClick,
  };
}

/**
 * Wraps useLongPress for a specific track, returning handlers that can be
 * spread onto the track element. The onShortPress callback is called for
 * regular taps (not long-presses).
 */
export function useTrackLongPress(track: Track, onLongPress: (track: Track, e: React.TouchEvent | React.MouseEvent) => void) {
  const handler = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    onLongPress(track, e);
  }, [track, onLongPress]);

  const { wasLongPress, ...handlers } = useLongPress(handler, {
    delay: 500,
    threshold: 10,
  });

  return { wasLongPress, handlers };
}
