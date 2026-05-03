"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Zap,
  Coffee,
  CloudRain,
  Music,
  Wind,
  Flame,
  Heart,
  Sparkles,
  Plus,
  X,
  RotateCcw,
  Info,
  Ban,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Shield,
  BarChart3,
  Palette,
} from "lucide-react";

/* ── Animation config ── */
const stagger = {
  animate: { transition: { staggerChildren: 0.04 } },
};
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

/* ── Moods definition ── */
const MOODS = [
  { key: "energetic", label: "Энергичный", icon: Zap, desc: "Быстрый темп, мощные биты" },
  { key: "cozy", label: "Уютный", icon: Coffee, desc: "Мягкий и тёплый звук" },
  { key: "melancholic", label: "Меланхоличный", icon: CloudRain, desc: "Глубокий и эмоциональный" },
  { key: "dance", label: "Танцевальный", icon: Music, desc: "Ритм, который двигает" },
  { key: "atmospheric", label: "Атмосферный", icon: Wind, desc: "Пространственные текстуры" },
  { key: "aggressive", label: "Агрессивный", icon: Flame, desc: "Жёсткий и насыщенный" },
  { key: "romantic", label: "Романтичный", icon: Heart, desc: "Нежные мелодии" },
  { key: "dreamy", label: "Мечтательный", icon: Sparkles, desc: "Плавный и загадочный" },
] as const;

/* ── Custom slider component ── */
function TasteSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const color = value < 30 ? "#ef4444" : value > 70 ? "#22c55e" : "#6b7280";
  const glowColor =
    value < 30
      ? "rgba(239,68,68,0.3)"
      : value > 70
        ? "rgba(34,197,94,0.3)"
        : "transparent";

  const calcValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.round(
        Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      );
      onChange(pct);
    },
    [onChange],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      calcValue(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      calcValue(e.touches[0].clientX);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [calcValue]);

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    dragging.current = true;
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    calcValue(clientX);
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <span
        className="text-[10px] w-10 text-right shrink-0 select-none"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {value}%
      </span>
      <div
        ref={trackRef}
        className="relative h-2 rounded-full cursor-pointer flex-1 min-w-[120px]"
        style={{
          background: "rgba(255,255,255,0.08)",
        }}
        onMouseDown={handleDown}
        onTouchStart={handleDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        tabIndex={0}
      >
        {/* Filled track */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-75"
          style={{
            width: `${value}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${glowColor}`,
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 transition-all duration-75 pointer-events-none"
          style={{
            left: `calc(${value}% - 8px)`,
            backgroundColor: color,
            borderColor: "rgba(255,255,255,0.3)",
            boxShadow: `0 0 10px ${glowColor}`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Glass card ── */
function GlassCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </motion.div>
  );
}

/* ── Section header ── */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Icon
          className="w-4 h-4"
          style={{ color: "var(--mq-accent, #e03131)" }}
        />
      </div>
      <div>
        <h2
          className="text-base font-semibold leading-tight"
          style={{ color: "var(--mq-text)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════ */
export default function TasteProfileView() {
  const {
    likedTracksData,
    history,
    tasteGenres,
    tasteArtists,
    tasteMoods,
    excludedArtists,
    favoriteArtists,
    setTasteGenre,
    setTasteArtist,
    setTasteMood,
    toggleExcludedArtist,
    resetTasteProfile,
  } = useAppStore();

  const [customGenreInput, setCustomGenreInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    genres: true,
    artists: true,
    moods: true,
    summary: true,
    info: false,
  });

  /* ── Extract genres from user data ── */
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    likedTracksData.forEach((t) => {
      if (t.genre) genres.add(t.genre);
    });
    history
      .slice(0, 100)
      .forEach((h) => {
        if (h.track?.genre) genres.add(h.track.genre);
      });
    // Add custom genres already in taste profile
    Object.keys(tasteGenres).forEach((g) => genres.add(g));
    return Array.from(genres).sort((a, b) =>
      a.localeCompare(b, "ru", { sensitivity: "base" }),
    );
  }, [likedTracksData, history, tasteGenres]);

  /* ── Extract artists from user data ── */
  const allArtists = useMemo(() => {
    const artistMap = new Map<
      string,
      { count: number; avatar: string }
    >();
    likedTracksData.forEach((t) => {
      if (t.artist) {
        const existing = artistMap.get(t.artist) || {
          count: 0,
          avatar: t.cover || "",
        };
        artistMap.set(t.artist, {
          count: existing.count + 1,
          avatar: existing.avatar || t.cover || "",
        });
      }
    });
    history.slice(0, 100).forEach((h) => {
      if (h.track?.artist) {
        const existing = artistMap.get(h.track.artist) || {
          count: 0,
          avatar: h.track.cover || "",
        };
        artistMap.set(h.track.artist, {
          count: existing.count + 1,
          avatar: existing.avatar || h.track.cover || "",
        });
      }
    });
    // Add favorite artists
    favoriteArtists.forEach((fa) => {
      const existing = artistMap.get(fa.username) || {
        count: 0,
        avatar: fa.avatar || "",
      };
      artistMap.set(fa.username, {
        count: existing.count + 3,
        avatar: existing.avatar || fa.avatar || "",
      });
    });
    return Array.from(artistMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [likedTracksData, history, favoriteArtists]);

  /* ── Add custom genre ── */
  const addCustomGenre = useCallback(() => {
    const trimmed = customGenreInput.trim();
    if (trimmed && !allGenres.includes(trimmed)) {
      setTasteGenre(trimmed, 50);
      setCustomGenreInput("");
    }
  }, [customGenreInput, allGenres, setTasteGenre]);

  /* ── Toggle section ── */
  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ── Summary calculations ── */
  const summary = useMemo(() => {
    const genreEntries = Object.entries(tasteGenres);
    const boosted = genreEntries
      .filter(([, v]) => v > 50)
      .sort((a, b) => b[1] - a[1]);
    const reduced = genreEntries.filter(([, v]) => v < 30);
    const totalTracked = genreEntries.length;
    const topGenres = boosted.slice(0, 3).map(([g]) => g);

    // Diversity score: how spread out the boosts are (Shannon entropy-like)
    let diversity = 0;
    if (genreEntries.length > 0) {
      const values = genreEntries.map(([, v]) => v / 100);
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        const probs = values.map((v) => v / sum);
        const entropy = -probs.reduce((acc, p) => {
          if (p <= 0) return acc;
          return acc + p * Math.log2(p);
        }, 0);
        const maxEntropy = Math.log2(genreEntries.length);
        diversity = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
      }
    }

    return {
      totalTracked,
      topGenres,
      reducedCount: reduced.length,
      excludedCount: excludedArtists.length,
      moodCount: Object.keys(tasteMoods).length,
      diversity,
    };
  }, [tasteGenres, tasteMoods, excludedArtists]);

  /* ── Sorted genres for display ── */
  const sortedGenres = useMemo(() => {
    return allGenres
      .map((g) => ({ name: g, level: tasteGenres[g] ?? 50 }))
      .sort((a, b) => b.level - a.level);
  }, [allGenres, tasteGenres]);

  /* ── Sorted artists for display ── */
  const sortedArtists = useMemo(() => {
    return allArtists
      .map((a) => ({
        ...a,
        level: tasteArtists[a.name] ?? 50,
        isExcluded: excludedArtists.includes(a.name),
      }))
      .sort((a, b) => {
        if (a.isExcluded && !b.isExcluded) return 1;
        if (!a.isExcluded && b.isExcluded) return -1;
        return b.level - a.level;
      });
  }, [allArtists, tasteArtists, excludedArtists]);

  return (
    <motion.div
      variants={stagger}
      initial="initial"
      animate="animate"
      className="px-4 py-6 pb-28 lg:pb-8 max-w-5xl mx-auto space-y-5"
    >
      {/* ── Page header ── */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--mq-accent, #e03131), rgba(224,49,49,0.6))",
              boxShadow: "0 0 20px rgba(224,49,49,0.2)",
            }}
          >
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--mq-text)" }}
            >
              Профиль вкуса
            </h1>
            <p
              className="text-xs"
              style={{ color: "var(--mq-text-muted)" }}
            >
              Настройте свои музыкальные предпочтения
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={resetTasteProfile}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
          style={{
            color: "var(--mq-text-muted)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <RotateCcw className="w-3 h-3" />
          Сбросить
        </motion.button>
      </motion.div>

      {/* ═══ Section 1: Genre Map ═══ */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("genres")}
        >
          <SectionHeader
            icon={BarChart3}
            title="Карта жанров"
            subtitle={`${allGenres.length} жанров обнаружено`}
          />
          {expandedSections.genres ? (
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>

        <AnimatePresence>
          {expandedSections.genres && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {/* Scale legend */}
              <div className="flex items-center justify-between mb-4 text-[10px] px-1" style={{ color: "var(--mq-text-muted)" }}>
                <span>Исключить</span>
                <span>Нейтрально</span>
                <span>Любимый</span>
              </div>

              {/* Genre sliders */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {sortedGenres.map((genre) => {
                  const level = genre.level;
                  const barColor =
                    level < 30
                      ? "#ef4444"
                      : level > 70
                        ? "#22c55e"
                        : "rgba(255,255,255,0.15)";
                  const glowColor =
                    level > 70
                      ? "rgba(34,197,94,0.15)"
                      : level < 30
                        ? "rgba(239,68,68,0.15)"
                        : "transparent";

                  return (
                    <div
                      key={genre.name}
                      className="flex flex-col gap-1.5 rounded-xl p-3 transition-colors"
                      style={{
                        background: level > 70 ? `linear-gradient(135deg, rgba(34,197,94,0.06), transparent)` : level < 30 ? `linear-gradient(135deg, rgba(239,68,68,0.06), transparent)` : "transparent",
                        border: `1px solid ${level > 70 ? "rgba(34,197,94,0.12)" : level < 30 ? "rgba(239,68,68,0.12)" : "transparent"}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--mq-text)" }}
                        >
                          {genre.name}
                        </span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            color: barColor,
                            background: `${barColor}15`,
                          }}
                        >
                          {level < 20 ? "Исключён" : level < 40 ? "Снижен" : level < 60 ? "Нейтральный" : level < 80 ? "Повышен" : "Любимый"}
                        </span>
                      </div>
                      <TasteSlider
                        value={level}
                        onChange={(v) => setTasteGenre(genre.name, v)}
                      />
                    </div>
                  );
                })}

                {sortedGenres.length === 0 && (
                  <div className="text-center py-8">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--mq-text-muted)" }} />
                    <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                      Нет данных о жанрах. Слушайте музыку, чтобы создать карту.
                    </p>
                  </div>
                )}
              </div>

              {/* Add custom genre */}
              <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <input
                  type="text"
                  value={customGenreInput}
                  onChange={(e) => setCustomGenreInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomGenre()}
                  placeholder="Добавить свой жанр..."
                  className="flex-1 bg-transparent text-sm px-3 py-2 rounded-xl outline-none placeholder:text-white/20"
                  style={{
                    color: "var(--mq-text)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={addCustomGenre}
                  disabled={!customGenreInput.trim()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: "var(--mq-accent, #e03131)",
                    color: "#fff",
                  }}
                >
                  <Plus className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ═══ Section 2: Favorite Artists ═══ */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("artists")}
        >
          <SectionHeader
            icon={TrendingUp}
            title="Любимые артисты"
            subtitle={`${allArtists.length} артистов, ${excludedArtists.length} исключено`}
          />
          {expandedSections.artists ? (
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>

        <AnimatePresence>
          {expandedSections.artists && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {sortedArtists.map((artist) => (
                  <div
                    key={artist.name}
                    className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${artist.isExcluded ? "opacity-50" : ""}`}
                    style={{
                      background: artist.isExcluded
                        ? "rgba(239,68,68,0.04)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${artist.isExcluded ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)"}`,
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-xl shrink-0 overflow-hidden"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {artist.avatar ? (
                        <img
                          src={artist.avatar}
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: "var(--mq-text-muted)" }}>
                          {artist.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Info + slider */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--mq-text)" }}
                        >
                          {artist.name}
                        </span>
                        <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--mq-text-muted)" }}>
                          {artist.count}x
                        </span>
                      </div>
                      <TasteSlider
                        value={artist.level}
                        onChange={(v) => setTasteArtist(artist.name, v)}
                      />
                    </div>

                    {/* Exclude toggle */}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => toggleExcludedArtist(artist.name)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all"
                      style={{
                        backgroundColor: artist.isExcluded
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(255,255,255,0.04)",
                        border: `1px solid ${artist.isExcluded ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
                      }}
                      title={artist.isExcluded ? "Вернуть в рекомендации" : "Исключить"}
                    >
                      <Ban
                        className="w-3.5 h-3.5"
                        style={{
                          color: artist.isExcluded ? "#ef4444" : "var(--mq-text-muted)",
                        }}
                      />
                    </motion.button>
                  </div>
                ))}

                {sortedArtists.length === 0 && (
                  <div className="text-center py-8">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--mq-text-muted)" }} />
                    <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                      Нет данных об артистах. Слушайте музыку для анализа.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ═══ Section 3: Moods ═══ */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("moods")}
        >
          <SectionHeader
            icon={Sparkles}
            title="Настроения"
            subtitle={`${Object.keys(tasteMoods).filter((k) => tasteMoods[k] !== 50).length} настроений настроено`}
          />
          {expandedSections.moods ? (
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>

        <AnimatePresence>
          {expandedSections.moods && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MOODS.map((mood) => {
                  const Icon = mood.icon;
                  const level = tasteMoods[mood.key] ?? 50;
                  const isActive = level !== 50;

                  return (
                    <div
                      key={mood.key}
                      className="rounded-xl p-3 transition-colors"
                      style={{
                        background: isActive
                          ? level > 70
                            ? "rgba(34,197,94,0.05)"
                            : level < 30
                              ? "rgba(239,68,68,0.05)"
                              : "rgba(255,255,255,0.02)"
                          : "rgba(255,255,255,0.015)",
                        border: `1px solid ${isActive ? (level > 70 ? "rgba(34,197,94,0.1)" : level < 30 ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.06)") : "rgba(255,255,255,0.04)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: isActive
                              ? `${level > 70 ? "#22c55e" : level < 30 ? "#ef4444" : "var(--mq-accent, #e03131)"}15`
                              : "rgba(255,255,255,0.04)",
                          }}
                        >
                          <Icon
                            className="w-3.5 h-3.5"
                            style={{
                              color: isActive
                                ? level > 70
                                  ? "#22c55e"
                                  : level < 30
                                    ? "#ef4444"
                                    : "var(--mq-accent, #e03131)"
                                : "var(--mq-text-muted)",
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--mq-text)" }}
                          >
                            {mood.label}
                          </span>
                          <p
                            className="text-[10px] leading-tight"
                            style={{ color: "var(--mq-text-muted)" }}
                          >
                            {mood.desc}
                          </p>
                        </div>
                      </div>
                      <TasteSlider
                        value={level}
                        onChange={(v) => setTasteMood(mood.key, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ═══ Section 4: Taste Summary ═══ */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("summary")}
        >
          <SectionHeader
            icon={Shield}
            title="Профиль вкуса"
            subtitle="Сводная статистика"
          />
          {expandedSections.summary ? (
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>

        <AnimatePresence>
          {expandedSections.summary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Genres tracked */}
                <div
                  className="rounded-xl p-3 text-center"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--mq-accent, #e03131)" }}
                  >
                    {summary.totalTracked}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Жанров отслежено
                  </div>
                </div>

                {/* Excluded artists */}
                <div
                  className="rounded-xl p-3 text-center"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color: summary.excludedCount > 0 ? "#ef4444" : "var(--mq-text)",
                    }}
                  >
                    {summary.excludedCount}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Исключено артистов
                  </div>
                </div>

                {/* Diversity score */}
                <div
                  className="rounded-xl p-3 text-center"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summary.diversity > 70
                          ? "#22c55e"
                          : summary.diversity > 40
                            ? "#eab308"
                            : "var(--mq-text)",
                    }}
                  >
                    {summary.diversity}%
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Разнообразие вкуса
                  </div>
                </div>

                {/* Moods configured */}
                <div
                  className="rounded-xl p-3 text-center"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--mq-text)" }}
                  >
                    {summary.moodCount}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Настроений настроено
                  </div>
                </div>
              </div>

              {/* Top genres */}
              {summary.topGenres.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 className="text-xs font-medium mb-3" style={{ color: "var(--mq-text-muted)" }}>
                    Топ любимых жанров
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.topGenres.map((g, i) => (
                      <span
                        key={g}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{
                          background: "rgba(34,197,94,0.08)",
                          color: "#22c55e",
                          border: "1px solid rgba(34,197,94,0.15)",
                        }}
                      >
                        {i + 1}. {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Reduced genres */}
              {summary.reducedCount > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
                    Сниженные жанры ({summary.reducedCount})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(tasteGenres)
                      .filter(([, v]) => v < 30)
                      .map(([g]) => (
                        <span
                          key={g}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{
                            background: "rgba(239,68,68,0.08)",
                            color: "#ef4444",
                            border: "1px solid rgba(239,68,68,0.15)",
                          }}
                        >
                          {g}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ═══ Section 5: Recommendation Impact ═══ */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("info")}
        >
          <SectionHeader
            icon={Info}
            title="Влияние на рекомендации"
            subtitle="Как настройки влияют на выбор музыки"
          />
          {expandedSections.info ? (
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>

        <AnimatePresence>
          {expandedSections.info && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-3">
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(34,197,94,0.04)",
                    border: "1px solid rgba(34,197,94,0.08)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                    <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                      Повышенный приоритет
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                    Жанры и артисты с ползунком выше 70% будут чаще встречаться в
                    рекомендациях. Чем выше показатель, тем больше треков этого типа
                    появится в вашей ленте.
                  </p>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(239,68,68,0.04)",
                    border: "1px solid rgba(239,68,68,0.08)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Ban className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                    <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                      Исключение из рекомендаций
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                    Ползунок ниже 30% снижает частоту появления контента. При 0% жанр
                    полностью исключается из рекомендаций. Исключённые артисты не будут
                    показываться ни в одном разделе.
                  </p>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Music className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>
                      Нейтральная зона (30-70%)
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                    В этом диапазоне предпочтения не влияют на рекомендации. Треки
                    будут появляться в обычном порядке на основе других алгоритмов.
                  </p>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>
                      Настроения
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                    Настройки настроений влияют на порядок треков в очереди и
                    рекомендации в режиме "Моя волна". Энергичная музыка будет
                    чаще предлагаться в начале, уютная -- в конце дня.
                  </p>
                </div>
              </div>

              {/* Preview tag list */}
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 className="text-xs font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
                  Предпросмотр фильтров рекомендаций
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(tasteGenres)
                    .filter(([, v]) => v > 70)
                    .map(([g, v]) => (
                      <span
                        key={`boost-${g}`}
                        className="text-[10px] px-2 py-1 rounded-md"
                        style={{
                          background: "rgba(34,197,94,0.1)",
                          color: "#22c55e",
                        }}
                      >
                        +{g} ({v}%)
                      </span>
                    ))}
                  {Object.entries(tasteGenres)
                    .filter(([, v]) => v < 10)
                    .map(([g]) => (
                      <span
                        key={`excl-${g}`}
                        className="text-[10px] px-2 py-1 rounded-md"
                        style={{
                          background: "rgba(239,68,68,0.1)",
                          color: "#ef4444",
                        }}
                      >
                        -{g}
                      </span>
                    ))}
                  {excludedArtists.map((a) => (
                    <span
                      key={`ban-${a}`}
                      className="text-[10px] px-2 py-1 rounded-md"
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        color: "#ef4444",
                      }}
                    >
                      x{a}
                    </span>
                  ))}
                  {Object.entries(tasteGenres).filter(([, v]) => v > 70).length === 0 &&
                    Object.entries(tasteGenres).filter(([, v]) => v < 10).length === 0 &&
                    excludedArtists.length === 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-md" style={{ color: "var(--mq-text-muted)", background: "rgba(255,255,255,0.04)" }}>
                        Нет активных фильтров
                      </span>
                    )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ── Scrollbar styles ── */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </motion.div>
  );
}
