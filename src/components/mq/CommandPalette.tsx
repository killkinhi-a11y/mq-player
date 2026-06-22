"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type ViewType } from "@/store/useAppStore";
import {
  Search, Home, Library, MessageCircle, Settings, User, Play, Pause,
  SkipForward, SkipBack, Heart, Shuffle, Repeat, Plus, ListMusic,
  Clock, Download, LogOut, Music, Headphones, ChevronRight, Command,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  icon: typeof Home;
  action: () => void;
  group: "Навигация" | "Воспроизведение" | "Действия" | "Недавние" | "Плейлисты";
  shortcut?: string;
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Store
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const shuffle = useAppStore((s) => s.shuffle);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const repeat = useAppStore((s) => s.repeat);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const playlists = useAppStore((s) => s.playlists);
  const history = useAppStore((s) => s.history);
  const logout = useAppStore((s) => s.logout);

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const nav: CommandItem[] = [
      { id: "nav-home", label: "Главная", icon: Home, action: () => setView("main"), group: "Навигация" },
      { id: "nav-search", label: "Поиск музыки", icon: Search, action: () => setView("search"), group: "Навигация" },
      { id: "nav-library", label: "Библиотека", icon: Library, action: () => setView("library"), group: "Навигация" },
      { id: "nav-messenger", label: "Чаты", icon: MessageCircle, action: () => setView("messenger"), group: "Навигация" },
      { id: "nav-settings", label: "Настройки", icon: Settings, action: () => setView("settings"), group: "Навигация" },
      { id: "nav-profile", label: "Профиль", icon: User, action: () => setView("profile"), group: "Навигация" },
    ];

    const playback: CommandItem[] = currentTrack ? [
      { id: "pb-toggle", label: isPlaying ? "Пауза" : "Воспроизвести", icon: isPlaying ? Pause : Play, action: () => togglePlay(), group: "Воспроизведение" },
      { id: "pb-next", label: "Следующий трек", icon: SkipForward, action: () => nextTrack(), group: "Воспроизведение" },
      { id: "pb-prev", label: "Предыдущий трек", icon: SkipBack, action: () => prevTrack(), group: "Воспроизведение" },
      { id: "pb-shuffle", label: shuffle ? "Выключить перемешивание" : "Включить перемешивание", icon: Shuffle, action: () => toggleShuffle(), group: "Воспроизведение" },
      { id: "pb-repeat", label: repeat === "off" ? "Повтор" : repeat === "all" ? "Повтор одного" : "Выключить повтор", icon: Repeat, action: () => toggleRepeat(), group: "Воспроизведение" },
      { id: "pb-fullview", label: isFullTrackViewOpen ? "Закрыть плеер" : "Открыть полный плеер", icon: Headphones, action: () => setFullTrackViewOpen(!isFullTrackViewOpen), group: "Воспроизведение" },
      { id: "pb-like", label: likedTrackIds.includes(currentTrack.id) ? "Убрать из любимых" : "В любимые", icon: Heart, action: () => toggleLike(currentTrack.id, currentTrack), group: "Воспроизведение" },
    ] : [];

    const actions: CommandItem[] = [
      { id: "act-logout", label: "Выйти из аккаунта", icon: LogOut, action: () => { logout(); setIsOpen(false); }, group: "Действия" },
    ];

    // Add recent tracks from history
    const recentTracks: CommandItem[] = history.slice(0, 5).map((h: any) => ({
      id: `track-${h.track.id}`,
      label: h.track.title,
      icon: Music,
      action: () => {
        useAppStore.getState().playTrack(h.track, history.map((hh: any) => hh.track));
        setIsOpen(false);
      },
      group: "Недавние",
    }));

    // Add playlists
    const playlistCmds: CommandItem[] = (playlists || []).slice(0, 5).map((pl: any) => ({
      id: `pl-${pl.id}`,
      label: pl.name,
      icon: ListMusic,
      action: () => {
        useAppStore.getState().setSelectedPlaylistId(pl.id);
        setView("library");
        setIsOpen(false);
      },
      group: "Плейлисты",
    }));

    return [...nav, ...playback, ...recentTracks, ...playlistCmds, ...actions];
  }, [currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, shuffle, toggleShuffle, repeat, toggleRepeat, isFullTrackViewOpen, setFullTrackViewOpen, likedTrackIds, toggleLike, setView, logout, history, playlists]);

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Group filtered commands
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.group]) groups[cmd.group] = [];
      groups[cmd.group].push(cmd);
    }
    return groups;
  }, [filtered]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) {
        cmd.action();
        setIsOpen(false);
      }
    }
  }, [filtered, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIdx = -1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        onClick={() => setIsOpen(false)}
      >
        <motion.div
          initial={{ scale: 0.96, y: -10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: -10 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-full max-w-lg rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-card) 95%, transparent)",
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
            border: "1px solid var(--mq-glass-border)",
            boxShadow: "var(--mq-shadow-dramatic)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "var(--mq-border)" }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Поиск команд, треков, плейлистов..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--mq-text)" }}
            />
            <kbd
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
            >
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2" style={{ scrollbarWidth: "thin" }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Ничего не найдено</p>
              </div>
            ) : (
              Object.entries(grouped).map(([groupName, items]) => (
                <div key={groupName} className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-4 py-1.5" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                    {groupName}
                  </p>
                  {items.map((cmd) => {
                    flatIdx++;
                    const idx = flatIdx;
                    const isSelected = idx === selectedIndex;
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        data-idx={idx}
                        onClick={() => { cmd.action(); setIsOpen(false); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
                        }}
                      >
                        <Icon
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: isSelected ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                        />
                        <span
                          className="flex-1 text-sm truncate"
                          style={{ color: isSelected ? "var(--mq-text)" : "var(--mq-text-muted)", fontWeight: isSelected ? 500 : 400 }}
                        >
                          {cmd.label}
                        </span>
                        {isSelected && (
                          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: "var(--mq-border)" }}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                <kbd className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>↑↓</kbd>
                навигация
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                <kbd className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>↵</kbd>
                выбрать
              </span>
            </div>
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
              <Command className="w-2.5 h-2.5" />
              mq player
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
