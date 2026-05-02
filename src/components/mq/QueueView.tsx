"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration, type Track } from "@/lib/musicApi";
import {
  X,
  ChevronUp,
  ChevronDown,
  Music,
  Play,
  Pause,
} from "lucide-react";

interface QueueViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QueueView({ isOpen, onClose }: QueueViewProps) {
  const {
    currentTrack,
    queue,
    queueIndex,
    upNext,
    isPlaying,
    playTrack,
    removeFromUpNext,
    moveInUpNext,
    animationsEnabled,
  } = useAppStore();

  // Remaining tracks from the queue after the current one
  const remainingQueue = useMemo(() => {
    if (queueIndex + 1 >= queue.length) return [];
    return queue.slice(queueIndex + 1);
  }, [queue, queueIndex]);

  const hasContent = upNext.length > 0 || remainingQueue.length > 0;

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

          {/* Panel */}
          <motion.div
            key="queue-panel"
            initial={animationsEnabled ? { y: "100%" } : undefined}
            animate={{ y: 0 }}
            exit={animationsEnabled ? { y: "100%" } : undefined}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 350,
            }}
            className="fixed inset-x-0 bottom-0 z-[410] flex flex-col rounded-t-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-player-bg, var(--mq-bg))",
              maxHeight: "75vh",
              maxWidth: "32rem",
              margin: "0 auto",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
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
              className="flex items-center justify-between px-4 pb-3 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--mq-border)" }}
            >
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--mq-text)" }}
              >
                Очередь
              </h2>
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

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "var(--mq-border) transparent",
              }}
            >
              {/* Current track / Now playing */}
              {currentTrack && (
                <div className="px-4 pt-3 pb-2">
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

              {/* Section 1: Up Next (manually added) */}
              <div className="px-4 pt-2 pb-1">
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Следующие
                </p>
                {upNext.length > 0 ? (
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {upNext.map((track, index) => (
                        <UpNextTrackItem
                          key={track.id}
                          track={track}
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
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <p
                    className="text-xs py-2"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
                  >
                    Нет добавленных треков
                  </p>
                )}
              </div>

              {/* Divider */}
              {upNext.length > 0 && remainingQueue.length > 0 && (
                <div
                  className="mx-4 my-2"
                  style={{ borderTop: "1px solid var(--mq-border)" }}
                />
              )}

              {/* Section 2: From queue (remaining) */}
              {remainingQueue.length > 0 && (
                <div className="px-4 pt-1 pb-6">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Из очереди
                  </p>
                  <div className="space-y-1">
                    {remainingQueue.map((track, index) => (
                      <QueueTrackItem
                        key={`${track.id}-queue-${queueIndex + 1 + index}`}
                        track={track}
                        queuePosition={queueIndex + 2 + index}
                        onClick={() => playTrack(track, queue)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!currentTrack && !hasContent && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Music
                    className="w-10 h-10"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
                  />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Очередь пуста
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
                  >
                    Воспроизведите трек, чтобы начать
                  </p>
                </div>
              )}
            </div>
          </motion.div>
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
    <div
      className="flex items-center gap-3 p-2 rounded-xl"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
      }}
    >
      {/* Cover */}
      <div
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
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
          <Music className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
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
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ height: ["30%", "100%", "50%", "80%", "30%"] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.span
                className="w-[3px] rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ height: ["60%", "30%", "80%", "40%", "60%"] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.15,
                }}
              />
              <motion.span
                className="w-[3px] rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ height: ["80%", "50%", "30%", "90%", "80%"] }}
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
    </div>
  );
}

function UpNextTrackItem({
  track,
  index,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  track: Track;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50, height: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.03] transition-colors"
      style={{ border: "1px solid transparent" }}
    >
      {/* Position number */}
      <span
        className="w-5 text-xs text-center flex-shrink-0 tabular-nums"
        style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
      >
        {index + 1}
      </span>

      {/* Cover */}
      <div
        className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
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
            className="w-3.5 h-3.5"
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
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

function QueueTrackItem({
  track,
  queuePosition,
  onClick,
}: {
  track: Track;
  queuePosition: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group w-full flex items-center gap-2 p-2 rounded-xl transition-colors text-left"
      style={{
        border: "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
      }}
    >
      {/* Queue position */}
      <span
        className="w-5 text-xs text-center flex-shrink-0 tabular-nums"
        style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}
      >
        {queuePosition}
      </span>

      {/* Cover */}
      <div
        className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
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
            className="w-3.5 h-3.5"
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

      {/* Play icon on hover */}
      <Play
        className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--mq-accent)" }}
      />
    </motion.button>
  );
}
