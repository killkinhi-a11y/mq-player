"use client";

import { memo, useEffect, useRef } from "react";
import { X, AlertTriangle, ArrowRightLeft, ExternalLink, Music2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ProviderBadge, type ProviderId } from "./ui/ProviderBadge";
import type { ResolveCandidate } from "@/lib/playback/client";
import { formatDuration } from "@/lib/musicApi";

/**
 * SourceSheet — global source chooser, two honest modes:
 *
 * 1. LOW-CONFIDENCE (auto-opened by the PlaybackResolver): the catalog track
 *    could not be matched confidently — autoplay is suppressed and the user
 *    explicitly picks the source (or opens Spotify / searches manually).
 *
 * 2. SWITCH (opened from the player): the track is already playing — switch
 *    SoundCloud ↔ Audius while preserving currentTime.
 */

function candidateProvider(c: ResolveCandidate): ProviderId {
  return c.provider === "soundcloud" ? "soundcloud" : "audius";
}

const SourceSheetBase = function SourceSheet() {
  const lowConfidencePick = useAppStore((s) => s.lowConfidencePick);
  const sourceSwitcher = useAppStore((s) => s.sourceSwitcher);
  const dismissLowConfidencePick = useAppStore((s) => s.dismissLowConfidencePick);
  const closeSourceSwitcher = useAppStore((s) => s.closeSourceSwitcher);
  const confirmSourcePick = useAppStore((s) => s.confirmSourcePick);
  const switchPlaybackSource = useAppStore((s) => s.switchPlaybackSource);
  const backdropRef = useRef<HTMLDivElement>(null);

  const mode: "low" | "switch" | null =
    lowConfidencePick ? "low" : sourceSwitcher ? "switch" : null;

  // Escape closes
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissLowConfidencePick();
        closeSourceSwitcher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, dismissLowConfidencePick, closeSourceSwitcher]);

  if (!mode) return null;

  const catalog = mode === "low" ? lowConfidencePick!.catalog : null;
  const alternatives: ResolveCandidate[] =
    mode === "low" ? lowConfidencePick!.alternatives : sourceSwitcher!.alternatives;
  const currentId = mode === "switch" ? sourceSwitcher!.currentId : undefined;

  const close = () => {
    dismissLowConfidencePick();
    closeSourceSwitcher();
  };

  const pick = (cand: ResolveCandidate) => {
    close();
    if (mode === "low") confirmSourcePick(cand);
    else switchPlaybackSource(cand);
  };

  return (
    <div
      ref={backdropRef}
      data-mq-source-sheet={mode}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "low" ? "Выбор источника воспроизведения" : "Смена источника"}
      onClick={(e) => {
        if (e.target === backdropRef.current) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "20px 20px 0 0",
          background: "var(--mq-surface-1, #14141c)",
          border: "1px solid var(--mq-edge, rgba(255,255,255,0.08))",
          borderBottom: "none",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              display: "grid", placeItems: "center",
              background: mode === "low" ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)",
              color: mode === "low" ? "#f59e0b" : "#8b5cf6",
            }}
          >
            {mode === "low" ? <AlertTriangle size={20} /> : <ArrowRightLeft size={20} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {mode === "low" ? "Не удалось точно сопоставить трек" : "Источник воспроизведения"}
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {catalog
                ? `${catalog.artist} — ${catalog.title}`
                : "Позиция сохранится при смене источника"}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Закрыть"
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
              background: "transparent", color: "inherit", display: "grid", placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {mode === "low" && (
          <div style={{ padding: "0 20px 8px", fontSize: 12.5, opacity: 0.6, lineHeight: 1.5 }}>
            Каталог: <ProviderBadge provider="spotify" />. Ни один аудио-источник не совпал
            уверенно — выберите вариант вручную, чтобы не слушать неправильный трек.
          </div>
        )}

        {/* Candidates */}
        <div style={{ overflowY: "auto", padding: "4px 12px 16px" }}>
          {alternatives.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", opacity: 0.6, fontSize: 13 }}>
              Нет доступных источников
            </div>
          )}
          {alternatives.map((cand) => {
            const isCurrentById = mode === "switch" && currentId === `${cand.provider}:${cand.sourceId}`;
            const pct = Math.round((cand.confidence ?? 0) * 100);
            return (
              <button
                key={`${cand.provider}:${cand.sourceId}`}
                onClick={() => pick(cand)}
                data-mq-source-candidate={`${cand.provider}:${cand.sourceId}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  margin: "2px 0",
                  borderRadius: 12,
                  border: `1px solid ${isCurrentById ? "var(--mq-accent, #8b5cf6)" : "transparent"}`,
                  background: isCurrentById ? "var(--mq-accent-soft, rgba(139,92,246,0.08))" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrentById) e.currentTarget.style.background = "var(--mq-surface-2, rgba(255,255,255,0.04))";
                }}
                onMouseLeave={(e) => {
                  if (!isCurrentById) e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Artwork */}
                <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--mq-surface-2, rgba(255,255,255,0.05))", display: "grid", placeItems: "center" }}>
                  {cand.artwork ? (
                    <img
                      src={cand.artwork}
                      alt=""
                      width={44}
                      height={44}
                      style={{ objectFit: "cover", width: "100%", height: "100%" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Music2 size={18} opacity={0.4} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cand.title || "—"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cand.artist || "—"}
                    {cand.durationSec > 0 ? ` · ${formatDuration(cand.durationSec)}` : ""}
                    {cand.isPreview ? " · фрагмент" : ""}
                    {cand.version && cand.version !== "original" ? ` · ${cand.version}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <ProviderBadge provider={candidateProvider(cand)} />
                  <span style={{ fontSize: 11, opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>
                    {pct > 0 ? `${pct}%` : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Low-confidence secondary actions */}
        {mode === "low" && catalog && (
          <div
            style={{
              borderTop: "1px solid var(--mq-edge, rgba(255,255,255,0.07))",
              padding: "10px 16px calc(14px + env(safe-area-inset-bottom))",
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href={`https://open.spotify.com/track/${catalog.spotifyId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, padding: "8px 14px", borderRadius: 10,
                background: "var(--mq-surface-2, rgba(255,255,255,0.05))",
                color: "inherit", textDecoration: "none",
              }}
            >
              <ExternalLink size={14} /> Открыть в Spotify
            </a>
            <button
              onClick={() => {
                close();
                useAppStore.getState().setView("search");
              }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                background: "var(--mq-surface-2, rgba(255,255,255,0.05))",
                color: "inherit", border: "none",
              }}
            >
              Искать вручную
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const SourceSheet = memo(SourceSheetBase);
export default SourceSheet;
