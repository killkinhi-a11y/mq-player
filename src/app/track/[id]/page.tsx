"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Play, Pause, Loader2, Music, ExternalLink } from "lucide-react";

interface TrackData {
  title: string;
  artist: string;
  cover: string;
  duration: number;
  genre: string;
  streamUrl: string | null;
  previewUrl: string;
  scTrackId: number;
  description: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ShareTrackPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [track, setTrack] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Fetch track data
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const controller = new AbortController();

    async function fetchTrack() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(
          `/api/tracks/share?scTrackId=${encodeURIComponent(id)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (cancelled) return;

        if (!res.ok) {
          setError("Трек не найден");
          setIsLoading(false);
          return;
        }

        const data: TrackData = await res.json();
        if (cancelled) return;

        setTrack(data);
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить трек");
          setIsLoading(false);
        }
      }
    }

    fetchTrack();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  // Set up audio element
  useEffect(() => {
    if (!track?.streamUrl) return;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (!isDragging.current) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleLoadedData = () => {
      setIsBuffering(false);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsBuffering(false);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadeddata", handleLoadedData);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadeddata", handleLoadedData);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [track?.streamUrl]);

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !track?.streamUrl) return;

    if (!audio.src || audio.src === "") {
      audio.src = track.streamUrl;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        setIsBuffering(true);
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsBuffering(false);
        setIsPlaying(false);
      }
    }
  }, [isPlaying, track?.streamUrl]);

  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current;
    if (!audio || !progressRef.current || !audio.duration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const newTime = pct * audio.duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleProgressDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    seekTo(e.clientX);
    const onMove = (ev: MouseEvent) => seekTo(ev.clientX);
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [seekTo]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    seekTo(e.touches[0].clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekTo(ev.touches[0].clientX);
    };
    const onEnd = () => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [seekTo]);

  const audioDuration = audioRef.current?.duration || track?.duration || 0;
  const progressPct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0e0e0e" }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#e03131" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Загрузка трека...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !track) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0e0e0e" }}>
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <Music className="w-12 h-12" style={{ color: "rgba(255,255,255,0.15)" }} />
          <p className="text-lg font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {error || "Трек не найден"}
          </p>
          <a
            href="/"
            className="text-sm px-5 py-2 rounded-lg transition-colors"
            style={{ background: "#e03131", color: "#fff" }}
          >
            Открыть MQ Player
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0e0e0e" }}>
      {/* Gradient background with cover blur */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: track.cover
            ? `linear-gradient(to bottom, rgba(14,14,14,0.3), #0e0e0e 80%)`
            : undefined,
        }}
      />
      {track.cover && (
        <div
          className="fixed inset-0 -z-20"
          style={{
            backgroundImage: `url(${track.cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(80px) brightness(0.3) saturate(1.5)",
          }}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-16">
        <div className="w-full max-w-md">
          {/* Cover art */}
          <div className="flex justify-center mb-8">
            <div
              className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl shadow-2xl overflow-hidden flex-shrink-0"
              style={{
                background: track.cover ? undefined : "linear-gradient(135deg, #e03131 0%, #991b1b 100%)",
                boxShadow: track.cover ? "0 20px 60px rgba(0,0,0,0.6)" : undefined,
              }}
            >
              {track.cover ? (
                <img
                  src={track.cover}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
              )}
            </div>
          </div>

          {/* Track info */}
          <div className="text-center mb-8 px-2">
            <h1
              className="text-xl sm:text-2xl font-bold mb-2 leading-tight"
              style={{ color: "#fff", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {track.title}
            </h1>
            <p
              className="text-base sm:text-lg mb-2"
              style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
            >
              {track.artist}
            </p>
            {track.genre && (
              <span
                className="inline-block text-xs px-3 py-1 rounded-full mb-3"
                style={{
                  background: "rgba(224,49,49,0.15)",
                  color: "#e03131",
                  fontFamily: "var(--font-outfit), system-ui, sans-serif",
                }}
              >
                {track.genre}
              </span>
            )}
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              {formatDuration(track.duration)}
            </p>
          </div>

          {/* Inline player */}
          <div className="mb-6 px-2">
            {/* Progress bar */}
            <div
              ref={progressRef}
              onMouseDown={handleProgressDown}
              onTouchStart={handleProgressTouchStart}
              className="w-full h-2 rounded-full cursor-pointer group mb-3"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-100 relative"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #e03131, #ff6b6b)",
                }}
              >
                <div
                  className="absolute right-0 top-1/2 w-3.5 h-3.5 rounded-full shadow-md transition-transform group-hover:scale-125"
                  style={{
                    background: "#fff",
                    transform: "translate(50%, -50%)",
                    boxShadow: "0 0 8px rgba(224,49,49,0.5)",
                  }}
                />
              </div>
            </div>

            {/* Time labels + controls */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.35)" }}>
                {formatDuration(currentTime)}
              </span>

              <button
                onClick={handlePlayPause}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                style={{
                  background: "#e03131",
                  color: "#fff",
                  boxShadow: "0 4px 20px rgba(224,49,49,0.4)",
                }}
              >
                {isBuffering ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>

              <span className="text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.35)" }}>
                {formatDuration(audioDuration)}
              </span>
            </div>
          </div>

          {/* CTA button */}
          <div className="text-center">
            <a
              href="/play"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110 active:scale-95"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontFamily: "var(--font-outfit), system-ui, sans-serif",
              }}
            >
              Слушать полностью в MQ
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Description */}
          {track.description && (
            <div className="mt-8 px-2">
              <p
                className="text-xs leading-relaxed"
                style={{
                  color: "rgba(255,255,255,0.35)",
                  maxHeight: "120px",
                  overflow: "hidden",
                }}
              >
                {track.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-6 px-4">
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
          mq — Музыкальный плеер
        </p>
      </div>
    </div>
  );
}
