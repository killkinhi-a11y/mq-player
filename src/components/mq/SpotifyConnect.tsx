"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, LogOut, Loader2 } from "lucide-react";

interface SpotifyStatus {
  connected: boolean;
  user?: {
    id: string;
    display_name: string;
    images: Array<{ url: string }>;
  };
}

export default function SpotifyConnect() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/auth/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/spotify/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[Spotify Connect] Failed to get auth URL:", err);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/spotify/auth/logout", { method: "POST" });
      setStatus({ connected: false });
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
        <span className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Проверка Spotify...</span>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div
        className="rounded-xl p-3"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Spotify icon */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#1DB954" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5" style={{ color: "#1DB954" }} />
              <span className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                Spotify подключен
              </span>
            </div>
            {status.user?.display_name && (
              <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                {status.user.display_name}
              </p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--mq-text-muted)" }}
            title="Отключить Spotify"
          >
            {disconnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </motion.button>
        </div>

        <p className="text-[10px] mt-2" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
          Полное воспроизведение треков Spotify (требуется Premium)
        </p>
      </div>
    );
  }

  // Not connected state
  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
      }}
    >
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleConnect}
        className="w-full flex items-center gap-3 text-left"
      >
        {/* Spotify icon */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#1DB954" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
            Подключить Spotify
          </p>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Полное воспроизведение (требуется Premium)
          </p>
        </div>
      </motion.button>
    </div>
  );
}
