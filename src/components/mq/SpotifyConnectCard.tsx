"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSpotifySession } from "@/hooks/useSpotifySession";
import { spotifyAuth } from "@/lib/spotify/auth";

/**
 * SpotifyConnectCard — V2 §9/§15/§18 settings surface.
 *
 * Honest states only:
 *  - not configured (no server Client ID) → setup hint
 *  - not connected → connect button (PKCE, official Spotify page)
 *  - connected + Premium → «Официальное воспроизведение активно»
 *  - connected + Free → catalog/library available, playback auto-falls back
 *    to the alternative resolver
 *  - browser unsupported (Safari/mobile) → honest note
 */
export function SpotifyConnectCard() {
  const { connect, disconnect } = useSpotifySession();
  const connected = useAppStore((s) => s.spotifyConnected);
  const premium = useAppStore((s) => s.spotifyPremium);
  const displayName = useAppStore((s) => s.spotifyDisplayName);
  const playbackSupported = useAppStore((s) => s.spotifyPlaybackSupported);

  const status = useMemo(() => spotifyAuth.getStatus(), [connected, premium]); // eslint-disable-line react-hooks/exhaustive-deps
  const configured = status.configured;

  const dot = (color: string) => (
    <span
      aria-hidden
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );

  return (
    <div
      data-mq-spotify-card={connected ? (premium ? "premium" : "free") : "off"}
      className="px-3 sm:px-4 py-4"
      style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor" aria-hidden style={{ color: "#1db954" }}>
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
            Spotify
          </p>
          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            Полное официальное воспроизведение · каталог · библиотека
          </p>
        </div>
      </div>

      {!configured ? (
        <div
          className="rounded-[var(--mq-r-card)] p-3 text-xs leading-relaxed"
          style={{ backgroundColor: "var(--mq-overlay-hover)", color: "var(--mq-text-muted)" }}
        >
          Приложение MQ ещё не сконфигурировано для Spotify (SPOTIFY_CLIENT_ID
          на сервере). После настройки в панели Vercel появится кнопка
          подключения.
        </div>
      ) : !connected ? (
        <>
          <button
            onClick={() => { connect().catch(() => {}); }}
            className="w-full py-2.5 rounded-full text-sm font-bold"
            style={{ backgroundColor: "#1db954", color: "#000" }}
          >
            Подключить Spotify
          </button>
          <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            Официальная авторизация Spotify (OAuth PKCE). Для полного
            воспроизведения нужен Premium; каталог и библиотека доступны на
            любом аккаунте.
          </p>
        </>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--mq-text)" }}>
            {dot(premium ? "#1db954" : "var(--mq-text-muted)")}
            <span className="font-semibold">{displayName || "Подключён"}</span>
            <span
              className="mq-t-meta-2 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: premium ? "#1db954" : "var(--mq-text-muted)",
                backgroundColor: premium
                  ? "color-mix(in srgb, #1db954 14%, transparent)"
                  : "var(--mq-overlay-hover)",
              }}
            >
              {premium ? "Premium" : "Free"}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            {premium
              ? playbackSupported
                ? "Официальное воспроизведение включено: треки Spotify играют полностью (Web Playback SDK), приоритет выше альтернативных источников."
                : "Premium активен, но этот браузер не поддерживает Web Playback SDK (нужен десктопный Chrome / Edge / Firefox). Треки Spotify будут автоматически играть через SoundCloud/Audius."
              : "Каталог и библиотека Spotify доступны. Полное воспроизведение требует Premium — без него треки автоматически играют через SoundCloud/Audius."}
          </p>

          <button
            onClick={disconnect}
            className="w-full py-2 rounded-full text-xs font-semibold"
            style={{
              border: "1px solid var(--mq-edge-strong)",
              color: "var(--mq-text-muted)",
            }}
          >
            Отключить Spotify
          </button>
        </div>
      )}
    </div>
  );
}
