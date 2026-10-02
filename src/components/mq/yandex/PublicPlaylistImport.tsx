"use client";

/**
 * PUBLIC Yandex Music playlist import — in-modal flow.
 *
 * URL (already validated as a Yandex Music playlist URL) →
 *   1. POST /api/yandex/public-playlist      (loading → playlist card)
 *   2. POST /api/yandex/public-playlist/match (chunked matching, progress)
 *   3. Preview (matched / ambiguous / unmatched counts)
 *   4. Import → local playlist (order preserved, _src metadata) → success
 *
 * NO OAuth, NO Yandex login, NO tokens — the public endpoints are tokenless.
 * Design follows the existing import dialog (same tokens: --mq-card,
 * --mq-input-bg, --mq-accent, --mq-text-muted; same radii and 44px targets).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, Music2, CheckCircle2 } from "lucide-react";
import type { Track } from "@/lib/musicApi";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { useToast } from "@/hooks/use-toast";
import type { YandexTrackMeta } from "@/lib/yandex/types";
import { PUBLIC_MATCH_CHUNK } from "@/lib/yandex/public-import";

type Phase = "loading" | "matching" | "preview" | "importing" | "done";

interface PlaylistPreview {
  title: string;
  ownerLogin: string;
  coverUrl: string;
  kind: number;
  uid: number | null;
}

interface MatchEntryLite {
  position: number;
  sourceTrackId: string;
  sourceAlbumId: string | null;
  yandexTitle: string;
  yandexArtists: string[];
  yandexDurationSec: number;
  status: "matched" | "ambiguous" | "unmatched";
  score?: number;
  exact?: boolean;
  mqTrack?: Track | null;
  candidates?: Track[];
}

export default function PublicPlaylistImport({
  url,
  onCancel,
  onFinished,
}: {
  url: string;
  onCancel: () => void;
  onFinished: () => void;
}) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistPreview | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [totalTracks, setTotalTracks] = useState(0);
  const [matches, setMatches] = useState<MatchEntryLite[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelledRef = useRef(false);
  const tracksRef = useRef<YandexTrackMeta[]>([]);
  const startedRef = useRef(false);

  // ── Stage 1: fetch the public playlist ──────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    cancelledRef.current = false;
    (async () => {
      try {
        const res = await fetch("/api/yandex/public-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json().catch(() => null);
        if (cancelledRef.current) return;
        if (!res.ok || !data || data.error) {
          setError(
            data?.message ||
              (res.status === 404
                ? "Не удалось получить плейлист. Возможно, он приватный или недоступен без авторизации."
                : "Не удалось загрузить плейлист. Попробуйте ещё раз.")
          );
          return;
        }
        tracksRef.current = Array.isArray(data.tracks) ? data.tracks : [];
        setPlaylist(data.playlist);
        setSourceUrl(data.sourceUrl || "");
        setTotalTracks(data.trackCount || tracksRef.current.length);
        setProgress({ done: 0, total: tracksRef.current.length });
        if (tracksRef.current.length === 0) {
          setError("В этом плейлисте нет треков.");
          return;
        }
        setPhase("matching");
      } catch {
        if (!cancelledRef.current) setError("Сервер недоступен. Проверьте соединение и попробуйте ещё раз.");
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [url]);

  // ── Stage 2: chunked matching ───────────────────────────────────────────
  const matchStartedRef = useRef(false);
  useEffect(() => {
    if (phase !== "matching" || !playlist || matchStartedRef.current) return;
    matchStartedRef.current = true;
    cancelledRef.current = false;
    (async () => {
      const tracks = tracksRef.current;
      const collected: MatchEntryLite[] = [];
      try {
        for (let i = 0; i < tracks.length; i += PUBLIC_MATCH_CHUNK) {
          if (cancelledRef.current) return;
          const slice = tracks.slice(i, i + PUBLIC_MATCH_CHUNK);
          const res = await fetch("/api/yandex/public-playlist/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracks: slice }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.message || "Не удалось подобрать треки.");
          }
          const data = await res.json();
          collected.push(...(data.matches || []));
          setMatches([...collected]);
          setProgress({ done: Math.min(i + PUBLIC_MATCH_CHUNK, tracks.length), total: tracks.length });
        }
        setPhase("preview");
      } catch (e) {
        if (!cancelledRef.current) {
          setError(e instanceof Error && e.message ? e.message : "Не удалось подобрать треки. Попробуйте ещё раз.");
        }
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [phase, playlist]);

  const matchedCount = matches.filter((m) => m.status === "matched" && m.mqTrack).length;
  const ambiguousCount = matches.filter((m) => m.status === "ambiguous").length;
  const unmatchedCount = matches.filter((m) => m.status === "unmatched").length;

  const doImport = useCallback(() => {
    if (!playlist) return;
    setPhase("importing");
    try {
      const chosen = matches
        .filter((m) => m.status === "matched" && m.mqTrack)
        .sort((a, b) => a.position - b.position);
      const tracks: Track[] = chosen.map((m) => ({
        ...m.mqTrack!,
        _src: "yandex_music" as const,
        _srcTrackId: m.sourceTrackId,
        _srcPlaylistKind: playlist.kind,
      }));

      const existingNames = new Set(
        useAppStore.getState().playlists.map((p) => p.name.trim().toLowerCase())
      );
      let name = playlist.title || "Яндекс.Музыка плейлист";
      if (existingNames.has(name.trim().toLowerCase())) {
        name = `${name} (Яндекс)`;
        let n = 2;
        while (existingNames.has(`${name} ${n}`.trim().toLowerCase())) n += 1;
        name = `${name} ${n}`;
      }

      const newPl: UserPlaylist = {
        id: `pl_yandex_${Date.now()}`,
        name,
        description: `Импортировано из Яндекс.Музыки${playlist.ownerLogin ? ` · ${playlist.ownerLogin}` : ""}${sourceUrl ? ` · ${sourceUrl}` : ""}`.slice(0, 500),
        cover: playlist.coverUrl || "",
        tracks,
        createdAt: Date.now(),
      };
      setTimeout(() => useAppStore.setState((s) => ({ playlists: [...s.playlists, newPl] })), 0);
      setPhase("done");
      toast({
        title: "Импорт успешен!",
        description:
          tracks.length > 0
            ? `${tracks.length} треков добавлено${ambiguousCount + unmatchedCount > 0 ? ` · не найдено: ${unmatchedCount + ambiguousCount}` : ""}`
            : "Подходящих треков не нашлось",
      });
      setTimeout(() => onFinished(), 900);
    } catch {
      setError("Не удалось создать плейлист. Попробуйте ещё раз.");
    }
  }, [matches, playlist, sourceUrl, ambiguousCount, unmatchedCount, toast, onFinished]);

  // ── render ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-3">
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#ef4444" }}>
              {error}
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text)" }}
        >
          Назад
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          Загружаем плейлист…
        </p>
      </div>
    );
  }

  if (!playlist) return null;

  const cover = (
    <div
      className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}
    >
      {playlist.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={playlist.coverUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <Music2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
      )}
    </div>
  );

  if (phase === "matching") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {cover}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
              {playlist.title}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
              {playlist.ownerLogin && `${playlist.ownerLogin} · `}
              {totalTracks} треков
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--mq-accent)" }} />
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Подбор треков: {Math.min(progress.done, progress.total)}/{progress.total}…
          </p>
        </div>
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl text-sm font-medium"
          style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text-muted)" }}
        >
          Отменить
        </button>
      </div>
    );
  }

  // phase: preview | importing | done
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {cover}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
            {playlist.title}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            {playlist.ownerLogin && `${playlist.ownerLogin} · `}
            {totalTracks} треков
          </p>
        </div>
      </div>

      <div
        className="rounded-xl p-3 space-y-1.5"
        style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}
      >
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: "var(--mq-text-muted)" }}>Найдено</span>
          <span className="font-semibold" style={{ color: "var(--mq-text)" }}>
            {matchedCount}
          </span>
        </div>
        {ambiguousCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--mq-text-muted)" }}>Неоднозначные (не импортируются)</span>
            <span className="font-semibold" style={{ color: "var(--mq-text)" }}>
              {ambiguousCount}
            </span>
          </div>
        )}
        {unmatchedCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--mq-text-muted)" }}>Не найдено</span>
            <span className="font-semibold" style={{ color: "var(--mq-text)" }}>
              {unmatchedCount}
            </span>
          </div>
        )}
        {matchedCount === 0 && (
          <p className="text-xs pt-1" style={{ color: "var(--mq-text-muted)" }}>
            Ни один трек не нашёлся в каталоге MQ. Попробуйте другой плейлист или «Импорт текстом».
          </p>
        )}
      </div>

      {phase === "done" ? (
        <div className="flex items-center gap-2 py-1">
          <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
          <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
            Импорт успешен!
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={phase === "importing"}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text-muted)" }}
          >
            Отмена
          </button>
          <button
            onClick={doImport}
            disabled={phase === "importing" || matchedCount === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor:
                matchedCount > 0 && phase !== "importing" ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
              color: matchedCount > 0 && phase !== "importing" ? "#fff" : "var(--mq-text-muted)",
            }}
          >
            {phase === "importing" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Импорт…
              </span>
            ) : (
              `Импортировать ${matchedCount} ${pluralTracks(matchedCount)}`
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function pluralTracks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "трек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "трека";
  return "треков";
}
