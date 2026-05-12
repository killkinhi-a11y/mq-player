"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";
import {
  Send, Sparkles, Play, Plus, X, ArrowLeft, RefreshCw,
  Music, Headphones, Zap, Coffee, Dumbbell, Moon, Sun,
  Heart, Flame, PartyPopper, CloudRain, TreePine, GraduationCap,
  Plane, MessageSquare, ChevronDown, Loader2, Volume2,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tracks?: Track[];
  queries?: string[];
  timestamp: number;
}

// Quick suggestion chips
const QUICK_SUGGESTIONS = [
  { label: "Вечерняя атмосфера", icon: Moon, prompt: "Подбери расслабляющую музыку для тихого вечера" },
  { label: "Для работы", icon: Coffee, prompt: "Нужна фоновая музыка для концентрации и работы" },
  { label: "Тренировка", icon: Dumbbell, prompt: "Подбери энергичную музыку для тренировки" },
  { label: "Дорога", icon: Plane, prompt: "Музыка для долгой поездки, что-то бодрящее" },
  { label: "Грустное настроение", icon: CloudRain, prompt: "Подбери меланхоличную музыку для грустного настроения" },
  { label: "Вечеринка", icon: PartyPopper, prompt: "Подбери треки для домашней вечеринки" },
  { label: "Утренний вайб", icon: Sun, prompt: "Что-то позитивное и бодрящее на утро" },
  { label: "На природе", icon: TreePine, prompt: "Спокойная акустическая музыка на природе" },
  { label: "Учёба", icon: GraduationCap, prompt: "Фоновая музыка для учёбы, без слов если можно" },
  { label: "Подобное любимому", icon: Heart, prompt: "Найди что-то похожее на мою любимую музыку" },
  { label: "Новинки", icon: Flame, prompt: "Покажи свежие новинки в моих любимых жанрах" },
  { label: "Случайный микс", icon: Zap, prompt: "Сурприз меня! Подбери что-то необычное, что я ещё не слышал" },
];

function TrackChip({ track, onPlay, onAdd }: { track: Track; onPlay: () => void; onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 p-2 rounded-xl cursor-pointer group transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
      }}
      onClick={onPlay}
    >
      {/* Cover */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.5 }}>
            <Music className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
          <Play className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>
          {track.artist}
          {track.genre ? ` · ${track.genre}` : ""}
        </p>
      </div>

      {/* Add button */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
      >
        <Plus className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "var(--mq-accent)" }}
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>MQ думает...</span>
    </div>
  );
}

export default function AIAssistant() {
  const {
    playTrack, likedTracksData, history, tasteGenres, tasteArtists, tasteMoods,
    animationsEnabled, addToUpNext, compactMode, dislikedTracksData,
    feedbackBatch, sessionStartTime, likedTrackIds,
  } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Привет! Я MQ — твой AI-помощник по музыке 🎵\n\nРасскажи, какое у тебя настроение или что ты хочешь послушать, и я подберу идеальные треки. Или выбери одну из подсказок ниже!",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Build taste profile for context — enriched with listening history
  const getTasteProfile = useCallback(() => {
    const topGenres = Object.entries(tasteGenres)
      .filter(([, v]) => v >= 20)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g);

    const topArtists = Object.entries(tasteArtists)
      .filter(([, v]) => v >= 20)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([a]) => a);

    const moods = Object.entries(tasteMoods || {})
      .filter(([, v]) => v >= 30)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m]) => m);

    const recentTracks = history.slice(0, 8).map(h => `${h.track.title} - ${h.track.artist}`);

    // ── Extract top genres from listening HISTORY (not just taste profile) ──
    const historyGenreCounts: Record<string, number> = {};
    const historyArtistCounts: Record<string, number> = {};
    for (const h of history.slice(0, 50)) {
      const genre = (h.track.genre || "").trim();
      const artist = (h.track.artist || "").trim();
      if (genre) historyGenreCounts[genre] = (historyGenreCounts[genre] || 0) + h.playCount;
      if (artist) historyArtistCounts[artist] = (historyArtistCounts[artist] || 0) + h.playCount;
    }
    const topHistoryGenres = Object.entries(historyGenreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);
    const topHistoryArtists = Object.entries(historyArtistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([a]) => a);

    // ── Feedback signals ──
    const skippedGenres = feedbackBatch?.skippedGenres || [];
    const completedGenres = feedbackBatch?.completedGenres || [];

    // ── Session duration ──
    const sessionMinutes = sessionStartTime
      ? Math.floor((Date.now() - sessionStartTime) / 60000)
      : 0;

    // Detect language
    const langCounts: Record<string, number> = { russian: 0, english: 0 };
    for (const entry of [...likedTracksData, ...history.slice(0, 30)]) {
      const t = "title" in entry ? entry : entry.track;
      const text = `${t.title || ""} ${t.artist || ""}`;
      const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      if (cyrillic / (cyrillic + latin + 1) > 0.4) langCounts.russian++;
      else if (latin / (cyrillic + latin + 1) > 0.6) langCounts.english++;
    }
    const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
    const language = sorted[0]?.[1] > 5 ? sorted[0][0] : "mixed";

    return {
      genres: topGenres,
      artists: topArtists,
      moods,
      language,
      recentTracks,
      topHistoryGenres,
      topHistoryArtists,
      skippedGenres,
      completedGenres,
      sessionMinutes,
      likedCount: likedTrackIds.length,
      historyCount: history.length,
    };
  }, [likedTracksData, history, tasteGenres, tasteArtists, tasteMoods, dislikedTracksData, feedbackBatch, sessionStartTime, likedTrackIds]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setIsLoading(true);

    try {
      const tasteProfile = getTasteProfile();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text.trim() }],
          tasteProfile,
          sessionId: "main",
        }),
      });

      const data = await res.json();

      // Handle error responses gracefully
      if (data.error) {
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: "Ой, что-то пошло не так при обращении к AI 😔 Попробуй ещё раз через пару секунд!",
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply || "Не удалось получить ответ",
        tracks: data.tracks || [],
        queries: data.queries || [],
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error("[AIAssistant] fetch error:", err);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Не удалось связаться с AI-сервером. Проверьте подключение и попробуйте ещё раз 🔄",
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading, getTasteProfile]);

  const handlePlayTrack = useCallback((track: Track, tracks: Track[]) => {
    playTrack(track, tracks);
  }, [playTrack]);

  const handleAddToUpNext = useCallback((track: Track) => {
    addToUpNext(track);
  }, [addToUpNext]);

  const handlePlayAllFromMessage = useCallback((tracks: Track[]) => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  }, [playTrack]);

  const handleClear = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Чат очищен! Чем могу помочь? 🎵",
        timestamp: Date.now(),
      },
    ]);
    setShowSuggestions(true);
    fetch("/api/ai/chat?sessionId=main", { method: "GET" }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--mq-border)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, var(--mq-accent), rgba(166,147,175,0.6))",
            boxShadow: "0 2px 12px rgba(166,147,175,0.3)",
          }}>
          <Sparkles className="w-4.5 h-4.5" style={{ color: "var(--mq-text)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>AI Помощник</h1>
          <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Подбирает музыку по описанию</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleClear}
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:opacity-80"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          title="Очистить чат"
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
        </motion.button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  msg.role === "user"
                    ? "rounded-br-md"
                    : "rounded-bl-md"
                }`}
                style={{
                  backgroundColor: msg.role === "user"
                    ? "var(--mq-accent)"
                    : "var(--mq-card)",
                  border: msg.role === "user"
                    ? "none"
                    : "1px solid var(--mq-border)",
                  color: msg.role === "user"
                    ? "var(--mq-text)"
                    : "var(--mq-text)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                }}
              >
                {/* Message text */}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>

                {/* Track results */}
                {msg.tracks && msg.tracks.length > 0 && (
                  <div className="mt-2.5">
                    {/* Play all button */}
                    {msg.tracks.length > 1 && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handlePlayAllFromMessage(msg.tracks!)}
                        className="flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all hover:opacity-80"
                        style={{
                          backgroundColor: "rgba(166,147,175,0.2)",
                          color: "var(--mq-accent)",
                          border: "1px solid rgba(166,147,175,0.3)",
                        }}
                      >
                        <Play className="w-3 h-3" fill="currentColor" />
                        Играть все ({msg.tracks.length})
                      </motion.button>
                    )}

                    {/* Track list */}
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                      {msg.tracks.slice(0, 8).map((track, i) => (
                        <TrackChip
                          key={track.id || i}
                          track={track}
                          onPlay={() => handlePlayTrack(track, msg.tracks!)}
                          onAdd={() => handleAddToUpNext(track)}
                        />
                      ))}
                    </div>

                    {/* Queries used */}
                    {msg.queries && msg.queries.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {msg.queries.map((q, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1.5 py-0.5 rounded-md"
                            style={{
                              backgroundColor: "var(--mq-bg)",
                              color: "var(--mq-text-muted)",
                            }}
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="rounded-2xl rounded-bl-md"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
              <TypingIndicator />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      <AnimatePresence>
        {showSuggestions && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="px-4 py-2">
              <p className="text-[10px] font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
                Быстрые подсказки
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.slice(0, 8).map((sug, i) => {
                  const Icon = sug.icon;
                  return (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => sendMessage(sug.prompt)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all"
                      style={{
                        backgroundColor: "var(--mq-card)",
                        border: "1px solid var(--mq-border)",
                        color: "var(--mq-text-muted)",
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      {sug.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            boxShadow: "0 -1px 8px rgba(0,0,0,0.1)",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Опиши настроение или жанр..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
            style={{ color: "var(--mq-text)" }}
            disabled={isLoading}
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer transition-all disabled:opacity-30"
            style={{
              backgroundColor: input.trim() ? "var(--mq-accent)" : "var(--mq-bg)",
              color: "var(--mq-text)",
            }}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </motion.button>
        </div>

        {/* Extra suggestions when scrolled up */}
        {!showSuggestions && messages.length <= 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-1.5 mt-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {QUICK_SUGGESTIONS.slice(0, 6).map((sug, i) => {
              const Icon = sug.icon;
              return (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sendMessage(sug.prompt)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] whitespace-nowrap cursor-pointer flex-shrink-0"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text-muted)",
                  }}
                >
                  <Icon className="w-2.5 h-2.5" />
                  {sug.label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
