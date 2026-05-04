"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Heart, Trash2, Play, Pause, Clock, Music, ArrowDownUp } from "lucide-react";
import type { Track } from "@/lib/musicApi";

export default function FavoritesView() {
  const {
    likedTracksData,
    likedTrackIds,
    dislikedTrackIds,
    dislikedTracksData,
    isPlaying,
    currentTrack,
    toggleLike,
    toggleDislike,
    playTrack,
    togglePlay,
    animationsEnabled,
    compactMode,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"liked" | "disliked">("liked");

  const tracks = activeTab === "liked" ? likedTracksData : dislikedTracksData;
  const trackIds = activeTab === "liked" ? likedTrackIds : dislikedTrackIds;

  const handlePlayTrack = useCallback((track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  }, [currentTrack, togglePlay, playTrack, tracks]);

  const handleRemoveTrack = useCallback((trackId: string, track: Track) => {
    if (activeTab === "liked") {
      toggleLike(trackId, track);
    } else {
      toggleDislike(trackId, track);
    }
  }, [activeTab, toggleLike, toggleDislike]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-40 lg:pb-28" : "p-4 lg:p-6 pb-40 lg:pb-28"} max-w-2xl mx-auto`}
    >
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <Heart className="w-5 h-5" style={{ color: "#ef4444" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
              Избранное
            </h1>
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              {likedTrackIds.length} понравившихся · {dislikedTrackIds.length} не понравившихся
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tab switcher */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1 p-1 rounded-xl mt-4 mb-4"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <button
          onClick={() => setActiveTab("liked")}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{
            backgroundColor: activeTab === "liked" ? "var(--mq-accent)" : "transparent",
            color: activeTab === "liked" ? "var(--mq-text)" : "var(--mq-text-muted)",
          }}
        >
          <Heart className="w-4 h-4" />
          Понравившиеся
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: activeTab === "liked" ? "rgba(255,255,255,0.15)" : "var(--mq-border)",
            }}
          >
            {likedTrackIds.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("disliked")}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{
            backgroundColor: activeTab === "disliked" ? "var(--mq-accent)" : "transparent",
            color: activeTab === "disliked" ? "var(--mq-text)" : "var(--mq-text-muted)",
          }}
        >
          <Trash2 className="w-4 h-4" />
          Не понравившиеся
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: activeTab === "disliked" ? "rgba(255,255,255,0.15)" : "var(--mq-border)",
            }}
          >
            {dislikedTrackIds.length}
          </span>
        </button>
      </motion.div>

      {/* Tracks list */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <motion.div
              initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
              animate={{ opacity: 1, scale: 1 }}
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
            >
              <Music className="w-7 h-7" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
            </motion.div>
            <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
              {activeTab === "liked" ? "Пока нет понравившихся треков" : "Нет непонравившихся треков"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              {activeTab === "liked"
                ? "Нажмите ❤️ на треке, чтобы добавить"
                : "Нажмите 👎 на треке, чтобы добавить"}
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
            <AnimatePresence>
              {tracks.map((track, index) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                const isCurrentlyPlaying = isCurrentTrack && isPlaying;
                return (
                  <motion.div
                    key={track.id}
                    initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-center gap-3 px-3 py-2.5 transition-all duration-200 group"
                    style={{
                      backgroundColor: isCurrentTrack ? "rgba(255,255,255,0.04)" : "transparent",
                      borderBottom: index < tracks.length - 1 ? "1px solid var(--mq-border)" : "none",
                    }}
                  >
                    {/* Play button / index */}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handlePlayTrack(track)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: isCurrentlyPlaying ? "var(--mq-accent)" : "var(--mq-surface, #1a1a1a)",
                        color: isCurrentlyPlaying ? "var(--mq-text)" : "var(--mq-text-muted)",
                      }}
                    >
                      {isCurrentlyPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </motion.button>

                    {/* Cover */}
                    {track.cover ? (
                      <img
                        src={track.cover}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
                      >
                        <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                      </div>
                    )}

                    {/* Track info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{
                          color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text)",
                        }}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                        {track.artist}
                      </p>
                    </div>

                    {/* Duration */}
                    {track.duration > 0 && (
                      <span className="text-[10px] flex-shrink-0 hidden sm:block" style={{ color: "var(--mq-text-muted)" }}>
                        {formatDuration(track.duration)}
                      </span>
                    )}

                    {/* Remove button */}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handleRemoveTrack(track.id, track)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                      style={{
                        color: activeTab === "liked" ? "#ef4444" : "var(--mq-text-muted)",
                      }}
                      title={activeTab === "liked" ? "Убрать из избранного" : "Убрать"}
                    >
                      {activeTab === "liked" ? (
                        <Heart className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </motion.button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
