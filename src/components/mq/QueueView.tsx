"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration, type Track } from "@/lib/musicApi";
import ContextMenu from "./ContextMenu";
import { useLongPress } from "@/hooks/useLongPress";
import {
  X,
  ChevronUp,
  ChevronDown,
  Music,
  Play,
  Pause,
  Trash2,
  GripVertical,
  ListMusic,
  History,
  Clock,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  DragOverlay,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

interface QueueViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QueueView({ isOpen, onClose }: QueueViewProps) {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const upNext = useAppStore((s) => s.upNext);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const removeFromUpNext = useAppStore((s) => s.removeFromUpNext);
  const moveInUpNext = useAppStore((s) => s.moveInUpNext);
  const moveInQueue = useAppStore((s) => s.moveInQueue);
  const clearUpNext = useAppStore((s) => s.clearUpNext);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const history = useAppStore((s) => s.history);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number; show: boolean }>({
    track: null as unknown as Track, x: 0, y: 0, show: false,
  });
  const openContextMenu = useCallback((track: Track, x: number, y: number) => {
    setContextMenu({ track, x, y, show: true });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu((prev) => ({ ...prev, show: false })), []);

  // ── DnD state ──
  const [activeUpNextId, setActiveUpNextId] = useState<UniqueIdentifier | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<UniqueIdentifier | null>(null);

  // Remaining tracks from the queue after the current one
  const remainingQueue = useMemo(() => {
    if (queueIndex + 1 >= queue.length) return [];
    return queue.slice(queueIndex + 1);
  }, [queue, queueIndex]);

  // Recently played tracks (up to 5 from history, excluding current)
  const recentlyPlayed = useMemo(() => {
    if (!currentTrack) return [];
    return history
      .filter(h => h.track.id !== currentTrack.id)
      .slice(0, 5)
      .map(h => h.track);
  }, [history, currentTrack]);

  const hasContent = upNext.length > 0 || remainingQueue.length > 0;

  // ── UpNext DnD IDs ──
  const upNextIds = useMemo(() => upNext.map((t) => t.id), [upNext]);

  // ── Queue DnD IDs (use unique keys with prefix to avoid collision with upNext) ──
  const queueItems = useMemo(() =>
    remainingQueue.map((track, index) => ({
      track,
      dndId: `queue-${track.id}-${index}` as UniqueIdentifier,
      queueAbsoluteIndex: queueIndex + 1 + index,
    })),
    [remainingQueue, queueIndex]
  );
  const queueIds = useMemo(() => queueItems.map((item) => item.dndId), [queueItems]);

  // ── Sensors with activation distance to avoid accidental drags ──
  const upNextSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const queueSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── UpNext DnD handlers ──
  const handleUpNextDragStart = useCallback((event: DragStartEvent) => {
    setActiveUpNextId(event.active.id);
  }, []);

  const handleUpNextDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveUpNextId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = upNext.findIndex((t) => t.id === active.id);
    const newIndex = upNext.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      moveInUpNext(oldIndex, newIndex);
    }
  }, [upNext, moveInUpNext]);

  const handleUpNextDragCancel = useCallback(() => {
    setActiveUpNextId(null);
  }, []);

  // ── Queue DnD handlers ──
  const handleQueueDragStart = useCallback((event: DragStartEvent) => {
    setActiveQueueId(event.active.id);
  }, []);

  const handleQueueDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveQueueId(null);
    if (!over || active.id === over.id) return;

    const oldItem = queueItems.find((item) => item.dndId === active.id);
    const newItem = queueItems.find((item) => item.dndId === over.id);
    if (oldItem && newItem) {
      moveInQueue(oldItem.queueAbsoluteIndex, newItem.queueAbsoluteIndex);
    }
  }, [queueItems, moveInQueue]);

  const handleQueueDragCancel = useCallback(() => {
    setActiveQueueId(null);
  }, []);

  // Active track data for drag overlays
  const activeUpNextTrack = useMemo(
    () => upNext.find((t) => t.id === activeUpNextId) ?? null,
    [upNext, activeUpNextId]
  );

  const activeQueueTrack = useMemo(
    () => queueItems.find((item) => item.dndId === activeQueueId)?.track ?? null,
    [queueItems, activeQueueId]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="queue-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[400]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={onClose}
          />

          {/* Panel — smoother animation */}
          <motion.div
            key="queue-panel"
            initial={animationsEnabled ? { y: "100%" } : undefined}
            animate={{ y: 0 }}
            exit={animationsEnabled ? { y: "100%" } : undefined}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 300,
              mass: 0.8,
            }}
            className="fixed inset-x-0 bottom-0 z-[410] flex flex-col rounded-t-3xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-player-bg, var(--mq-bg))",
              maxHeight: "80vh",
              maxWidth: "32rem",
              margin: "0 auto",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.4), 0 -2px 12px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--mq-border)" }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pb-3 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--mq-border)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
                  <ListMusic className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                </div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "var(--mq-text)" }}
                >
                  Очередь
                </h2>
                {upNext.length + remainingQueue.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                    {upNext.length + remainingQueue.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasContent && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      clearUpNext();
                      // Also clear remaining queue by resetting to just current track
                      if (currentTrack) {
                        playTrack(currentTrack, [currentTrack]);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:opacity-80"
                    style={{ color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.12)" }}
                    title="Очистить всю очередь"
                  >
                    <Trash2 className="w-3 h-3" />
                    Очистить
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-2 rounded-full transition-colors"
                  style={{
                    color: "var(--mq-text-muted)",
                  }}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "var(--mq-border) transparent",
              }}
            >
              {/* Current track / Now playing — enhanced */}
              {currentTrack && (
                <div className="px-5 pt-3 pb-2">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--mq-accent)" }}
                  >
                    Сейчас играет
                  </p>
                  <NowPlayingCard
                    track={currentTrack}
                    isPlaying={isPlaying}
                  />
                </div>
              )}

              {/* Recently played section */}
              {recentlyPlayed.length > 0 && (
                <div className="px-5 pt-2 pb-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <History className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Недавно играло
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <AnimatePresence initial={false}>
                      {recentlyPlayed.map((track, index) => (
                        <HistoryTrackItem
                          key={`${track.id}-hist-${index}`}
                          track={track}
                          onClick={() => playTrack(track, queue)}
                          isLiked={likedTrackIds.includes(track.id)}
                          onContextMenu={openContextMenu}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Section 1: Up Next (manually added) — wrapped with DndContext */}
              <div className="px-5 pt-2 pb-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Слушать дальше
                    </p>
                    {upNext.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                        {upNext.length}
                      </span>
                    )}
                  </div>
                  {upNext.length > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={clearUpNext}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors hover:opacity-80"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Очистить
                    </motion.button>
                  )}
                </div>
                {upNext.length > 0 ? (
                  <DndContext
                    sensors={upNextSensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragStart={handleUpNextDragStart}
                    onDragEnd={handleUpNextDragEnd}
                    onDragCancel={handleUpNextDragCancel}
                  >
                    <SortableContext items={upNextIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-0.5">
                        <AnimatePresence initial={false}>
                          {upNext.map((track, index) => (
                            <SortableUpNextTrackItem
                              key={track.id}
                              track={track}
                              id={track.id}
                              index={index}
                              isFirst={index === 0}
                              isLast={index === upNext.length - 1}
                              onRemove={() => removeFromUpNext(index)}
                              onMoveUp={
                                index > 0
                                  ? () => moveInUpNext(index, index - 1)
                                  : undefined
                              }
                              onMoveDown={
                                index < upNext.length - 1
                                  ? () => moveInUpNext(index, index + 1)
                                  : undefined
                              }
                              onContextMenu={openContextMenu}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </SortableContext>
                    <DragOverlay dropAnimation={null}>
                      {activeUpNextTrack ? (
                        <DragOverlayCard track={activeUpNextTrack} />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  <p
                    className="text-xs py-3"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
                  >
                    Нет добавленных треков
                  </p>
                )}
              </div>

              {/* Divider */}
              {upNext.length > 0 && remainingQueue.length > 0 && (
                <div
                  className="mx-5 my-2"
                  style={{ borderTop: "1px solid var(--mq-border)" }}
                />
              )}

              {/* Section 2: From queue (remaining) — wrapped with DndContext */}
              {remainingQueue.length > 0 && (
                <div className="px-5 pt-1 pb-6">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Из очереди
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                      {remainingQueue.length}
                    </span>
                  </div>
                  <DndContext
                    sensors={queueSensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragStart={handleQueueDragStart}
                    onDragEnd={handleQueueDragEnd}
                    onDragCancel={handleQueueDragCancel}
                  >
                    <SortableContext items={queueIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-0.5">
                        {queueItems.map((item, index) => (
                          <SortableQueueTrackItem
                            key={item.dndId}
                            id={item.dndId}
                            track={item.track}
                            queuePosition={item.queueAbsoluteIndex + 1}
                            index={index}
                            isFirst={index === 0}
                            isLast={index === queueItems.length - 1}
                            onClick={() => playTrack(item.track, queue)}
                            isLiked={likedTrackIds.includes(item.track.id)}
                            onContextMenu={openContextMenu}
                            onMoveUp={
                              index > 0
                                ? () => moveInQueue(item.queueAbsoluteIndex, queueItems[index - 1].queueAbsoluteIndex)
                                : undefined
                            }
                            onMoveDown={
                              index < queueItems.length - 1
                                ? () => moveInQueue(item.queueAbsoluteIndex, queueItems[index + 1].queueAbsoluteIndex)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay dropAnimation={null}>
                      {activeQueueTrack ? (
                        <DragOverlayCard track={activeQueueTrack} />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </div>
              )}

              {/* Empty state — better illustration and suggestion */}
              {!currentTrack && !hasContent && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
                    <ListMusic
                      className="w-10 h-10"
                      style={{ color: "var(--mq-accent)", opacity: 0.25 }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                      Очередь пуста
                    </p>
                    <p
                      className="text-xs mt-1.5 max-w-[240px] mx-auto leading-relaxed"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Найдите трек и добавьте его в очередь, чтобы начать слушать
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Context Menu for queue track items */}
          {contextMenu.show && contextMenu.track && (
            <ContextMenu
              track={contextMenu.track}
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={closeContextMenu}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Sub-components ── */

function NowPlayingCard({
  track,
  isPlaying,
}: {
  track: Track;
  isPlaying: boolean;
}) {
  return (
    <motion.div
      layout
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
        boxShadow: "0 0 0 1px rgba(var(--mq-accent-rgb, 255,255,255), 0.1)",
      }}
    >
      {/* Cover — larger for now playing */}
      <div
        className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: track.cover ? "transparent" : "var(--mq-accent)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: "var(--mq-accent)" }}
        >
          {track.title}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-xs tabular-nums flex-shrink-0"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>

      {/* Playing indicator */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <div
          className="flex items-end gap-[2px] h-4"
          style={{ color: "var(--mq-accent)" }}
        >
          {isPlaying ? (
            <>
              <motion.span
                className="w-[3px] rounded-full"
                style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                animate={{ scaleY: [0.3, 1, 0.5, 0.8, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.span
                className="w-[3px] rounded-full"
                style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                animate={{ scaleY: [0.6, 0.3, 0.8, 0.4, 0.6] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.15,
                }}
              />
              <motion.span
                className="w-[3px] rounded-full"
                style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                animate={{ scaleY: [0.8, 0.5, 0.3, 0.9, 0.8] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.3,
                }}
              />
            </>
          ) : (
            <Pause className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function HistoryTrackItem({
  track,
  onClick,
  isLiked,
  onContextMenu,
}: {
  track: Track;
  onClick: () => void;
  isLiked: boolean;
  onContextMenu: (track: Track, x: number, y: number) => void;
}) {
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    onContextMenu(track, clientX, clientY);
  }, [onContextMenu, track]);

  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(track, e.clientX, e.clientY);
  }, [onContextMenu, track]);

  const handleClick = useCallback(() => {
    if (longPressWasActive()) return;
    onClick();
  }, [onClick, longPressWasActive]);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onMouseDown={longPressHandlers.onMouseDown}
      onMouseUp={longPressHandlers.onMouseUp}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLElement).style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        longPressHandlers.onMouseLeave();
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        (e.currentTarget as HTMLElement).style.opacity = "0.6";
      }}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchMove={longPressHandlers.onTouchMove}
      className="group w-full flex items-center gap-2.5 p-2 rounded-xl transition-colors text-left select-none"
      style={{
        opacity: 0.6,
      }}
    >
      {/* Cover thumbnail */}
      <div
        className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: track.cover ? "transparent" : "var(--mq-card)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music
            className="w-3 h-3"
            style={{ color: "var(--mq-text-muted)" }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium truncate"
          style={{ color: "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <p
          className="text-[10px] truncate"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-[10px] tabular-nums flex-shrink-0"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  );
}

/* ── Sortable UpNext Track Item (uses @dnd-kit useSortable) ── */

function SortableUpNextTrackItem({
  track,
  id,
  index,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
  onContextMenu,
}: {
  track: Track;
  id: UniqueIdentifier;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onContextMenu: (track: Track, x: number, y: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
    border: isDragging ? "1.5px solid var(--mq-accent)" : "1px solid transparent",
    backgroundColor: isDragging ? "rgba(255,255,255,0.06)" : "transparent",
    boxShadow: isDragging ? "0 0 12px color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "none",
  };

  // Long-press handler for context menu
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    onContextMenu(track, clientX, clientY);
  }, [onContextMenu, track]);

  const longPressHandlers = useLongPress(handleLongPress);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(track, e.clientX, e.clientY);
  }, [onContextMenu, track]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50, scaleY: 0 }}
      transition={{ duration: 0.2 }}
      ref={setNodeRef}
      style={style}
      onContextMenu={handleRightClick}
      className="group relative flex items-center gap-2 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors select-none"
    >
      {/* Drag grip — connected to dnd-kit listeners */}
      <div
        className="flex-shrink-0 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity active:cursor-grabbing active:opacity-80 [@media(hover:none)]:opacity-30"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
      </div>

      {/* Position number */}
      <span
        className="w-5 text-xs text-center flex-shrink-0 tabular-nums"
        style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
      >
        {index + 1}
      </span>

      {/* Cover thumbnail */}
      <div
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: track.cover ? "transparent" : "var(--mq-card)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music
            className="w-4 h-4"
            style={{ color: "var(--mq-text-muted)" }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-xs tabular-nums flex-shrink-0 mr-1"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>

      {/* Controls (visible on hover / always on touch) */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100 transition-opacity">
        {/* Reorder up */}
        {!isFirst && onMoveUp ? (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onMoveUp}
            className="p-1 rounded"
            style={{ color: "var(--mq-text-muted)" }}
            title="Переместить вверх"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </motion.button>
        ) : (
          <div className="w-5" />
        )}

        {/* Reorder down */}
        {!isLast && onMoveDown ? (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onMoveDown}
            className="p-1 rounded"
            style={{ color: "var(--mq-text-muted)" }}
            title="Переместить вниз"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.button>
        ) : (
          <div className="w-5" />
        )}

        {/* Remove */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onRemove}
          className="p-1 rounded hover:text-red-400 transition-colors"
          style={{ color: "var(--mq-text-muted)" }}
          title="Убрать из очереди"
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ── Sortable Queue Track Item (uses @dnd-kit useSortable) ── */

function SortableQueueTrackItem({
  track,
  id,
  queuePosition,
  index,
  isFirst,
  isLast,
  onClick,
  isLiked,
  onContextMenu,
  onMoveUp,
  onMoveDown,
}: {
  track: Track;
  id: UniqueIdentifier;
  queuePosition: number;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
  isLiked: boolean;
  onContextMenu: (track: Track, x: number, y: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
    border: isDragging ? "1.5px solid var(--mq-accent)" : "1px solid transparent",
    backgroundColor: isDragging ? "rgba(255,255,255,0.06)" : "transparent",
    boxShadow: isDragging ? "0 0 12px color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "none",
  };

  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    onContextMenu(track, clientX, clientY);
  }, [onContextMenu, track]);

  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(track, e.clientX, e.clientY);
  }, [onContextMenu, track]);

  const handleClick = useCallback(() => {
    if (longPressWasActive()) return;
    onClick();
  }, [onClick, longPressWasActive]);

  return (
    <motion.div
      layout
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      className="group w-full flex items-center gap-2 p-2 rounded-xl transition-colors text-left select-none cursor-pointer"
    >
      {/* Drag grip — connected to dnd-kit listeners */}
      <div
        className="flex-shrink-0 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity active:cursor-grabbing active:opacity-80 [@media(hover:none)]:opacity-30"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
      </div>

      {/* Queue position */}
      <span
        className="w-5 text-xs text-center flex-shrink-0 tabular-nums"
        style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}
      >
        {queuePosition}
      </span>

      {/* Cover thumbnail */}
      <div
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: track.cover ? "transparent" : "var(--mq-card)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music
            className="w-4 h-4"
            style={{ color: "var(--mq-text-muted)" }}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-xs tabular-nums flex-shrink-0"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>

      {/* Reorder controls (visible on hover / touch) + Play icon */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
        {!isFirst && onMoveUp ? (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            className="p-1 rounded"
            style={{ color: "var(--mq-text-muted)" }}
            title="Переместить вверх"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </motion.button>
        ) : (
          <div className="w-5 hidden group-hover:block" />
        )}
        {!isLast && onMoveDown ? (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            className="p-1 rounded"
            style={{ color: "var(--mq-text-muted)" }}
            title="Переместить вниз"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.button>
        ) : (
          <div className="w-5 hidden group-hover:block" />
        )}
        <Play
          className="w-4 h-4"
          style={{ color: "var(--mq-accent)" }}
        />
      </div>
    </motion.div>
  );
}

/* ── Drag Overlay Card — shows a stylized preview while dragging ── */

function DragOverlayCard({ track }: { track: Track }) {
  return (
    <motion.div
      initial={{ scale: 1 }}
      animate={{ scale: 1.03 }}
      className="flex items-center gap-2 p-2.5 rounded-xl select-none"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1.5px solid var(--mq-accent)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 16px color-mix(in srgb, var(--mq-accent) 20%, transparent)",
        maxWidth: "32rem",
        cursor: "grabbing",
      }}
    >
      {/* Grip */}
      <div className="flex-shrink-0 opacity-50">
        <GripVertical className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
      </div>

      {/* Cover */}
      <div
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: track.cover ? "transparent" : "var(--mq-card)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-xs tabular-nums flex-shrink-0 mr-1"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>
    </motion.div>
  );
}
