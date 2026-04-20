"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, TrendingUp, Heart, Play, Users, Search, RefreshCw,
  ChevronLeft, Loader2, X, Music, Clock, Tag, Check, Send, ThumbsDown,
} from "lucide-react";
import TrackCard from "./TrackCard";
import { Input } from "@/components/ui/input";
import type { PublicPlaylist } from "@/store/useAppStore";

type Tab = "public" | "recommended";

const sortOptions = [
  { value: "popular", label: "Популярные" },
  { value: "new", label: "Новые" },
  { value: "likes", label: "По лайкам" },
];

export default function PublicPlaylistsView() {
  const {
    userId,
    publicPlaylists: publicPlaylistsData,
    recommendedPlaylists: recommendedPlaylistsData,
    publicPlaylistsLoading: publicPlaylistsLoadingData,
    recommendedPlaylistsLoading: recommendedPlaylistsLoadingData,
    fetchPublicPlaylists,
    fetchPlaylistRecommendations,
    togglePlaylistLike,
    addDislikedTags,
    dislikedTags,
    publishPlaylist,
    playTrack,
    animationsEnabled,
  } = useAppStore();

  const publicPlaylists = publicPlaylistsData as any as PublicPlaylist[];
  const recommendedPlaylists = recommendedPlaylistsData as any as PublicPlaylist[];
  const publicPlaylistsLoading = publicPlaylistsLoadingData as boolean;
  const recommendedPlaylistsLoading = recommendedPlaylistsLoadingData as boolean;

  const [tab, setTab] = useState<Tab>("public");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("popular");
  const [selectedPlaylist, setSelectedPlaylist] = useState<PublicPlaylist | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishPlaylistId, setPublishPlaylistId] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Load data on mount
  useEffect(() => {
    fetchPublicPlaylists({ sort });
    fetchPlaylistRecommendations();
  }, []);

  // Refresh when tab changes
  useEffect(() => {
    if (tab === "public") {
      fetchPublicPlaylists({ search, sort });
    } else {
      fetchPlaylistRecommendations();
    }
  }, [tab]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPublicPlaylists({ search, sort });
    }, 400);
    return () => clearTimeout(timer);
  }, [search, sort]);

  const handleRefresh = useCallback(() => {
    if (tab === "public") {
      fetchPublicPlaylists({ search, sort });
    } else {
      fetchPlaylistRecommendations();
    }
  }, [tab, search, sort, fetchPublicPlaylists, fetchPlaylistRecommendations]);

  const handleDislikeTags = useCallback((tags: string[]) => {
    addDislikedTags(tags);
    setTimeout(() => fetchPlaylistRecommendations(), 100);
  }, [addDislikedTags, fetchPlaylistRecommendations]);

  const handlePublish = async () => {
    if (!publishPlaylistId) return;
    setPublishing(true);
    const tags = publishTags.split(",").map((t) => t.trim()).filter(Boolean);
    const ok = await publishPlaylist(publishPlaylistId, tags);
    setPublishing(false);
    if (ok) {
      setPublishSuccess(true);
      setTimeout(() => {
        setPublishDialogOpen(false);
        setPublishSuccess(false);
        setPublishTags("");
        handleRefresh();
      }, 1200);
    }
  };

  // Detail view for a single playlist
  if (selectedPlaylist) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--mq-bg)", paddingBottom: 140 }}>
        <div className="max-w-2xl mx-auto px-4 py-4">
          <button onClick={() => setSelectedPlaylist(null)} className="flex items-center gap-2 mb-4 cursor-pointer"
            style={{ color: "var(--mq-text-muted)" }}>
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Назад</span>
          </button>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden flex-shrink-0"
              style={{ backgroundColor: "var(--mq-card)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
              {selectedPlaylist.cover ? (
                <img src={selectedPlaylist.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-10 h-10" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold mb-1 truncate" style={{ color: "var(--mq-text)" }}>
                {selectedPlaylist.name}
              </h2>
              <p className="text-sm mb-2" style={{ color: "var(--mq-text-muted)" }}>
                от @{selectedPlaylist.username}
              </p>
              {selectedPlaylist.description && (
                <p className="text-xs mb-2" style={{ color: "var(--mq-text-muted)" }}>
                  {selectedPlaylist.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                <span className="flex items-center gap-1"><Music className="w-3 h-3" />{selectedPlaylist.trackCount}</span>
                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{selectedPlaylist.likeCount}</span>
                <span className="flex items-center gap-1"><Play className="w-3 h-3" />{selectedPlaylist.playCount}</span>
              </div>
              {selectedPlaylist.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedPlaylist.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-accent)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (selectedPlaylist.tracks.length > 0) {
                  playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks);
                }
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium cursor-pointer"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
              <Play className="w-4 h-4" /> Play all
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => togglePlaylistLike(selectedPlaylist.id)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm cursor-pointer"
              style={{
                backgroundColor: selectedPlaylist.isLiked ? "rgba(239,68,68,0.15)" : "var(--mq-card)",
                border: `1px solid ${selectedPlaylist.isLiked ? "rgba(239,68,68,0.4)" : "var(--mq-border)"}`,
                color: selectedPlaylist.isLiked ? "#ef4444" : "var(--mq-text)",
              }}>
              <Heart className={`w-4 h-4 ${selectedPlaylist.isLiked ? "fill-current" : ""}`} />
              {selectedPlaylist.likeCount}
            </motion.button>
          </div>

          <div className="space-y-1">
            {selectedPlaylist.tracks.map((track, i) => (
              <TrackCard key={track.id} track={track} index={i} queue={selectedPlaylist.tracks} />
            ))}
            {selectedPlaylist.tracks.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Пустой плейлист
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--mq-bg)", paddingBottom: 140 }}>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
            <Globe className="w-5 h-5 inline mr-2" style={{ color: "var(--mq-accent)" }} />
            Публичные плейлисты
          </h2>
          <div className="flex items-center gap-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPublishDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
              <Send className="w-3.5 h-3.5" /> Опубликовать
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleRefresh}
              className="p-2 rounded-lg cursor-pointer"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
          <button onClick={() => setTab("public")}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all cursor-pointer"
            style={{
              backgroundColor: tab === "public" ? "var(--mq-accent)" : "transparent",
              color: tab === "public" ? "var(--mq-text)" : "var(--mq-text-muted)",
            }}>
            <Globe className="w-4 h-4" /> Все
          </button>
          <button onClick={() => setTab("recommended")}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all cursor-pointer"
            style={{
              backgroundColor: tab === "recommended" ? "var(--mq-accent)" : "transparent",
              color: tab === "recommended" ? "var(--mq-text)" : "var(--mq-text-muted)",
            }}>
            <TrendingUp className="w-4 h-4" /> Для тебя
          </button>
        </div>

        {/* Search + Sort (public tab only) */}
        {tab === "public" && (
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              <Input placeholder="Поиск плейлистов..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-10 min-h-[38px]" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
            </div>
            <div className="flex gap-1">
              {sortOptions.map((opt) => (
                <button key={opt.value} onClick={() => setSort(opt.value)}
                  className="px-3 py-2 rounded-lg text-xs transition-all cursor-pointer"
                  style={{
                    backgroundColor: sort === opt.value ? "var(--mq-accent)" : "var(--mq-card)",
                    border: sort === opt.value ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                    color: sort === opt.value ? "var(--mq-text)" : "var(--mq-text-muted)",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {(publicPlaylistsLoading || recommendedPlaylistsLoading) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mq-accent)" }} />
          </div>
        )}

        {/* Public playlists */}
        {tab === "public" && !publicPlaylistsLoading && (
          publicPlaylists.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {publicPlaylists.map((pl, i) => (
                <PlaylistCard key={pl.id} playlist={pl} index={i} onClick={() => setSelectedPlaylist(pl)}
                  onLike={() => togglePlaylistLike(pl.id)} animationsEnabled={animationsEnabled} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Globe className="w-12 h-12" />} text="Публичных плейлистов пока нет"
              hint="Стань первым — опубликуй свой плейлист!" />
          )
        )}

        {/* Recommended playlists */}
        {tab === "recommended" && !recommendedPlaylistsLoading && (
          recommendedPlaylists.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recommendedPlaylists.map((pl, i) => (
                <PlaylistCard key={pl.id} playlist={pl} index={i} onClick={() => setSelectedPlaylist(pl)}
                  onLike={() => togglePlaylistLike(pl.id)} onDislikeTags={() => handleDislikeTags(pl.tags)}
                  animationsEnabled={animationsEnabled} showScore />
              ))}
            </div>
          ) : (
            <EmptyState icon={<TrendingUp className="w-12 h-12" />} text="Пока нет рекомендаций"
              hint="Слушай больше музыки и ставь лайки — алгоритм подберёт плейлисты для тебя!" />
          )
        )}
      </div>

      {/* Publish Dialog */}
      <AnimatePresence>
        {publishDialogOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => !publishing && setPublishDialogOpen(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative z-10 w-full max-w-md rounded-2xl p-5"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>Опубликовать плейлист</h3>
                {!publishing && (
                  <button onClick={() => setPublishDialogOpen(false)} style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {publishSuccess ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
                    style={{ backgroundColor: "rgba(74,222,128,0.15)" }}>
                    <Check className="w-8 h-8" style={{ color: "#4ade80" }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Опубликовано!</p>
                </div>
              ) : (
                <>
                  <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>
                    Выбери плейлист и добавь теги для лучшей рекомендации
                  </p>

                  <PlaylistSelector onSelect={setPublishPlaylistId} selectedId={publishPlaylistId} />

                  <div className="mt-3">
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      <Input placeholder="Теги через запятую (pop, rock, chill...)"
                        value={publishTags} onChange={(e) => setPublishTags(e.target.value)}
                        className="pl-10" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                      Теги помогают алгоритму рекомендовать твой плейлист подходящим слушателям
                    </p>
                  </div>

                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={handlePublish} disabled={publishing || !publishPlaylistId}
                    className="w-full mt-4 py-3 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-40"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Send className="w-4 h-4 inline mr-2" />}
                    Опубликовать
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ──

function PlaylistCard({ playlist, index, onClick, onLike, onDislikeTags, animationsEnabled, showScore }: {
  playlist: PublicPlaylist;
  index: number;
  onClick: () => void;
  onLike: () => void;
  onDislikeTags?: () => void;
  animationsEnabled: boolean;
  showScore?: boolean;
}) {
  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl overflow-hidden cursor-pointer group"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      onClick={onClick}
    >
      <div className="relative h-32 overflow-hidden">
        {playlist.cover ? (
          <img src={playlist.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--mq-accent), #1a1a2e)" }}>
            <Music className="w-8 h-8" style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }} />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="text-sm font-bold truncate" style={{ color: "var(--mq-text)" }}>{playlist.name}</p>
          <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
            @{playlist.username} &middot; {playlist.trackCount} треков
          </p>
        </div>
        {showScore && playlist.score && playlist.score > 0 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px]"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: playlist.score >= 70 ? "#4ade80" : playlist.score >= 40 ? "#facc15" : "var(--mq-text-muted)", backdropFilter: "blur(8px)" }}>
            {playlist.score}%
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{playlist.likeCount}</span>
            <span className="flex items-center gap-1"><Play className="w-3 h-3" />{playlist.playCount}</span>
          </div>
          <motion.button whileTap={{ scale: 0.8 }}
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className="p-1 cursor-pointer"
            style={{ color: playlist.isLiked ? "#ef4444" : "var(--mq-text-muted)" }}>
            <Heart className={`w-4 h-4 ${playlist.isLiked ? "fill-current" : ""}`} />
          </motion.button>
          {onDislikeTags && playlist.tags.length > 0 && (
            <motion.button whileTap={{ scale: 0.8 }}
              onClick={(e) => { e.stopPropagation(); onDislikeTags(); }}
              className="p-1 cursor-pointer"
              style={{ color: "var(--mq-text-muted)" }}
              title="Не интересует">
              <ThumbsDown className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
        {playlist.tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 overflow-hidden">
            {playlist.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[9px] flex-shrink-0"
                style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-accent)" }}>
                {tag}
              </span>
            ))}
            {playlist.tags.length > 3 && (
              <span className="text-[9px]" style={{ color: "var(--mq-text-muted)" }}>+{playlist.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ icon, text, hint }: { icon: React.ReactNode; text: string; hint: string }) {
  return (
    <div className="text-center py-16">
      <div className="mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.25 }}>{icon}</div>
      <p className="text-sm mb-1" style={{ color: "var(--mq-text-muted)" }}>{text}</p>
      <p className="text-xs" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>{hint}</p>
    </div>
  );
}

function PlaylistSelector({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string }) {
  const { playlists } = useAppStore();
  if (playlists.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)" }}>
        У тебя нет плейлистов. Сначала создай плейлист с треками.
      </p>
    );
  }
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {playlists.map((pl) => (
        <button key={pl.id} onClick={() => onSelect(pl.id)}
          className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all cursor-pointer"
          style={{
            backgroundColor: selectedId === pl.id ? "rgba(224,49,49,0.1)" : "var(--mq-input-bg)",
            border: `1px solid ${selectedId === pl.id ? "var(--mq-accent)" : "var(--mq-border)"}`,
          }}>
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
            style={{ backgroundColor: "var(--mq-card)" }}>
            {pl.cover ? (
              <img src={pl.cover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>{pl.name}</p>
            <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>{pl.tracks.length} треков</p>
          </div>
          {selectedId === pl.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />}
        </button>
      ))}
    </div>
  );
}
