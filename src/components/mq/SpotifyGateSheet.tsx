"use client";

import { memo, useEffect, useRef } from "react";
import { X, AlertTriangle, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useSpotifySession } from "@/hooks/useSpotifySession";
import { spotifyGateCopy } from "@/lib/spotify/gate";
import { spotifyPlaybackAdapter } from "@/lib/spotify/playbackAdapter";
import { spotifyAuth } from "@/lib/spotify/auth";

/**
 * SpotifyGateSheet — the honest no-substitution gate (spec §7/§8).
 *
 * Opens when a SPOTIFY track cannot play through the official Web Playback
 * SDK. The track is STOPPED — it is never re-routed to SoundCloud/Audius
 * and never swapped for a similarly-named upload.
 *
 * States:
 *  not_connected       → «Подключите Spotify» + PKCE connect button
 *  not_premium         → «Требуется Spotify Premium» (Developer Policy §IV)
 *  unsupported_browser → desktop Chrome/Edge/Firefox requirement
 *  sdk_error           → «Воспроизведение через Spotify недоступно»
 *                        + Retry (same URI, same position)
 *                        + Reconnect Spotify (full session reset + login)
 */

const SpotifyGateSheetBase = function SpotifyGateSheet() {
  const gate = useAppStore((s) => s.spotifyGate);
  const dismissSpotifyGate = useAppStore((s) => s.dismissSpotifyGate);
  const retrySpotifyPlayback = useAppStore((s) => s.retrySpotifyPlayback);
  const { connect } = useSpotifySession();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissSpotifyGate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gate, dismissSpotifyGate]);

  if (!gate) return null;

  const copy = spotifyGateCopy(gate.reason, gate.errorMessage);

  const retry = () => {
    dismissSpotifyGate();
    // A hard SDK/DRM failure earlier marked the session downgraded — Retry
    // boots a FRESH Connect device (resetSession clears the downgrade) so
    // the engine's next attempt starts clean. Full OAuth re-login is the
    // separate «Переподключить Spotify» action.
    spotifyPlaybackAdapter.resetSession();
    retrySpotifyPlayback();
  };

  const reconnect = () => {
    // Full session reset → official Spotify login page. After the OAuth
    // round-trip the user lands back in MQ (spotify=connected).
    dismissSpotifyGate();
    spotifyPlaybackAdapter.resetSession();
    spotifyAuth.logout(false);
    connect().catch(() => {});
  };

  const Icon =
    gate.reason === "sdk_error" ? ShieldAlert
    : gate.reason === "not_connected" ? WifiOff
    : AlertTriangle;

  return (
    <div
      ref={backdropRef}
      data-mq-spotify-gate={gate.reason}
      role="dialog"
      aria-modal="true"
      aria-label="Spotify Official Playback"
      onClick={(e) => {
        if (e.target === backdropRef.current) dismissSpotifyGate();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 122,
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
          display: "flex",
          flexDirection: "column",
          borderRadius: "20px 20px 0 0",
          background: "var(--mq-surface-1, #14141c)",
          border: "1px solid var(--mq-edge, rgba(255,255,255,0.08))",
          borderBottom: "none",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.5)",
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, #1db954 12%, transparent)" }}
          >
            <Icon size={20} style={{ color: "#1db954" }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="text-base font-bold leading-snug"
              style={{ color: "var(--mq-text)" }}
            >
              {copy.title}
            </h2>
            {(gate.trackTitle || gate.trackArtist) && (
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: "var(--mq-text-muted)" }}
              >
                {gate.trackArtist} — {gate.trackTitle}
              </p>
            )}
          </div>
          <button
            onClick={dismissSpotifyGate}
            aria-label="Закрыть"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <p
          className="text-[13px] leading-relaxed mb-4"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {copy.message}
        </p>

        {/* Honest source note (§8: no substitution, ever) */}
        <p
          className="text-[11px] leading-relaxed mb-4 px-3 py-2 rounded-xl"
          style={{
            color: "var(--mq-text-muted)",
            backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.04))",
          }}
        >
          Трек не будет заменён другим источником: выбранный Spotify-трек играет
          только через официальный Spotify Web Playback SDK.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {gate.reason === "not_connected" && (
            <button
              onClick={() => { dismissSpotifyGate(); connect().catch(() => {}); }}
              className="w-full py-2.5 rounded-full text-sm font-bold"
              style={{ backgroundColor: "#1db954", color: "#000" }}
            >
              Подключить Spotify
            </button>
          )}

          {gate.reason === "sdk_error" && (
            <>
              <button
                onClick={retry}
                className="w-full py-2.5 rounded-full text-sm font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: "#1db954", color: "#000" }}
              >
                <RefreshCw size={15} /> Повторить
              </button>
              <button
                onClick={reconnect}
                className="w-full py-2 rounded-full text-xs font-semibold"
                style={{
                  border: "1px solid var(--mq-edge-strong, rgba(255,255,255,0.18))",
                  color: "var(--mq-text-muted)",
                }}
              >
                Переподключить Spotify
              </button>
            </>
          )}

          {(gate.reason === "not_premium" || gate.reason === "unsupported_browser") && (
            <button
              onClick={dismissSpotifyGate}
              className="w-full py-2 rounded-full text-xs font-semibold"
              style={{
                border: "1px solid var(--mq-edge-strong, rgba(255,255,255,0.18))",
                color: "var(--mq-text-muted)",
              }}
            >
              Понятно
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const SpotifyGateSheet = memo(SpotifyGateSheetBase);
