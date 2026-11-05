"use client";

// Extracted from MessengerView.tsx (Stage III decomposition) — moved verbatim.
import type { Message as ChatMessage } from "@/lib/musicApi";
import { Image as ImageIcon, type LucideIcon, Mic, Music2, Pause, Play, Users } from "lucide-react";
import { colorForId, decrypt, formatDuration, getInitials } from "./format";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Voice Message Bubble ─────────────────────────────────────────────────

export function VoiceMessageBubble({ voiceUrl, duration, isMine }: {
  voiceUrl: string; duration: number; isMine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dur, setDur] = useState(duration || 0);

  useEffect(() => {
    let cancelled = false;
    try {
      const audio = new Audio(voiceUrl);
      audio.onloadedmetadata = () => { if (!cancelled) setDur(audio.duration || duration || 0); };
      audio.ontimeupdate = () => { if (!cancelled) setCurrentTime(audio.currentTime || 0); };
      audio.onended = () => { if (!cancelled) { setPlaying(false); setCurrentTime(0); } };
      audioRef.current = audio;
    } catch {}
    return () => {
      cancelled = true;
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
    };
  }, [voiceUrl, duration]);

  const toggle = useCallback(() => {
    try {
      const a = audioRef.current;
      if (!a) return;
      if (playing) { a.pause(); setPlaying(false); }
      else { a.play().catch(() => {}); setPlaying(true); }
    } catch {}
  }, [playing]);

  const progress = dur > 0 ? (currentTime / dur) * 100 : 0;
  // Deterministic waveform (no Math.random to avoid re-renders).
  const bars = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 28; i++) arr.push(0.25 + ((i * 7) % 10) / 12);
    return arr;
  }, []);

  return (
    <div className="flex items-center gap-3 min-w-[200px] py-0.5">
      <motion.button onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform"
        whileTap={{ scale: 0.94 }}
        style={{
          backgroundColor: isMine
            ? "color-mix(in srgb, var(--mq-text) 18%, transparent)"
            : "var(--mq-platinum-lift)",
          boxShadow: isMine
            ? "none"
            : "inset 0 1px 0 rgba(255,255,255,0.09), 0 2px 10px rgba(0,0,0,0.32)",
          color: "#fff",
        }}
        aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <Pause className="w-4 h-4" />
          : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </motion.button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-[2px] h-7" aria-hidden="true">
          {bars.map((h, i) => {
            const isActive = (i / bars.length) * 100 < progress;
            return (
              <div key={i} className="w-[2px] rounded-full transition-colors"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isMine
                    ? (isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)")
                    : (isActive ? "var(--mq-platinum-hi)" : "color-mix(in srgb, var(--mq-text) 30%, transparent)"),
                }} />
            );
          })}
        </div>
        <div className="mq-t-meta-2 mt-1 tabular-nums"
          style={{ color: isMine ? "rgba(244,246,250,0.72)" : "var(--mq-text-muted)" }}>
          {formatDuration(playing ? currentTime : dur)}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────

export function Avatar({ src, name, id, size = 44, isGroup = false, ring = false }: {
  src?: string; name: string; id: string; size?: number; isGroup?: boolean; ring?: boolean;
}) {
  const ringShadow = ring
    ? { boxShadow: "0 0 0 1px color-mix(in srgb, var(--mq-text) 14%, transparent), 0 0 0 4px color-mix(in srgb, var(--mq-text) 4%, transparent)" }
    : undefined;
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size, boxShadow: ringShadow ? ringShadow.boxShadow : undefined }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: isGroup ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : colorForId(id),
        color: "#fff", fontSize: size * 0.4,
        boxShadow: ringShadow ? ringShadow.boxShadow : undefined,
      }}>
      {isGroup ? <Users style={{ width: size * 0.45, height: size * 0.45 }} /> : getInitials(name)}
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="mqms-date" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

// ─── List preview: type icon for the last message (voice / photo / track) ──

export function previewIconFor(last: ChatMessage | undefined): LucideIcon | null {
  if (!last) return null;
  if (last.messageType === "voice") return Mic;
  try {
    const raw = decrypt(last.content || "").trim();
    if (/^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp|svg)([?#]|$)/i.test(raw)) return ImageIcon;
    if (raw.startsWith("🎵")) return Music2;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "track_share") return Music2;
  } catch { /* plain text — no icon */ }
  return null;
}

// ─── History skeleton (loading state) ─────────────────────────────────────

export function HistorySkeleton() {
  const rows = [
    { mine: false, w: "w-40 sm:w-52", h: "h-11" },
    { mine: true, w: "w-56 sm:w-72", h: "h-12" },
    { mine: false, w: "w-32 sm:w-40", h: "h-9" },
    { mine: true, w: "w-44 sm:w-60", h: "h-11" },
  ];
  return (
    <div className="flex flex-col gap-4 pt-2" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
          <div
            className={`mqms-skel ${r.w} ${r.h} ${r.mine ? "mqms-tail-out" : "mqms-tail-in"}`}
            style={{ animationDelay: `${i * 0.14}s` }} />
        </div>
      ))}
    </div>
  );
}
