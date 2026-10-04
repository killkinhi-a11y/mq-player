"use client";

/**
 * DownloadMenu — the format-picker for track downloads (spec §7).
 *
 * Replaces the old naive "fetch element.src → anchor click" handler (broken
 * for HLS blob URLs, no format honesty) with a MenuCore page fed by the
 * download provider abstraction: MP3 / FLAC rows with REAL bitrate,
 * sample rate and size (probed from the actual file) or an honest
 * "unavailable + why". No fake FLAC, ever (see lib/download/providers).
 *
 * Hosts render this next to their existing menu; the host's "Скачать" item
 * just opens this one (same anchor, same close semantics).
 */

import { useEffect, useMemo, useState } from "react";
import { Download, FileAudio, Loader2, Music } from "lucide-react";
import MenuCore, { MenuHeader, type MenuElement } from "@/components/mq/ui/MenuCore";
import { toast } from "@/hooks/use-toast";
import type { Track } from "@/lib/musicApi";
import {
  downloadTrack,
  getDownloadFormats,
  saveDownloadResult,
  formatBytes,
  downloadErrorMessage,
} from "@/lib/download/downloadService";
import type { DownloadFormat } from "@/lib/download/types";

export interface DownloadMenuProps {
  track: Track;
  anchor: { x: number; y: number };
  onClose: () => void;
  side?: "below" | "above";
}

export function DownloadMenu({ track, anchor, onClose, side = "below" }: DownloadMenuProps) {
  // State is KEYED by track id; the rendered formats derive from the match
  // (no synchronous setState in the effect — the loading state falls out
  // of the key comparison when the track changes).
  const [store, setStore] = useState<{ forId: string | null; formats: DownloadFormat[] | null }>({
    forId: null,
    formats: null,
  });
  const [busy, setBusy] = useState<null | "mp3" | "flac">(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDownloadFormats(track)
      .then((f) => {
        if (!cancelled) setStore({ forId: track.id, formats: f });
      })
      .catch(() => {
        if (!cancelled) setFailed("Не удалось получить форматы");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  const formats = store.forId === track.id ? store.formats : null;

  const handleDownload = async (format: "mp3" | "flac") => {
    setBusy(format);
    const res = await downloadTrack(track, format);
    setBusy(null);
    if (res.ok) {
      saveDownloadResult(res);
      toast({ title: "Скачивание началось", description: res.filename });
      onClose();
    } else {
      toast({ title: "Скачивание не удалось", description: downloadErrorMessage(res.error) });
    }
  };

  const elements = useMemo<MenuElement[]>(() => {
    const out: MenuElement[] = [];
    if (failed) {
      out.push({ type: "item", id: "dl-error", icon: FileAudio, label: failed, disabled: true, onSelect: () => {} });
      return out;
    }
    if (!formats) {
      out.push({
        type: "item", id: "dl-loading", icon: Loader2, label: "Определение форматов…",
        disabled: true, onSelect: () => {},
      });
      return out;
    }
    out.push({ type: "label", text: "Формат" });
    for (const f of formats) {
      const hintParts: string[] = [];
      if (f.available) {
        if (f.sizeBytes) hintParts.push(formatBytes(f.sizeBytes) ?? "");
        if (f.note) hintParts.push(f.note);
      } else {
        hintParts.push("недоступно");
      }
      out.push({
        type: "item",
        id: `dl-${f.format}`,
        icon: f.format === "flac" ? FileAudio : Music,
        label: f.label,
        hint: hintParts.filter(Boolean).join(" · ") || undefined,
        disabled: !f.available || busy !== null,
        destructive: false,
        onSelect: () => { void handleDownload(f.format); },
        // keepOpen while busy so the "Скачивание…" hint stays visible
        keepOpen: true,
      });
      if (!f.available && f.note) {
        out.push({
          type: "item",
          id: `dl-${f.format}-why`,
          icon: Download,
          label: f.note,
          disabled: true,
          onSelect: () => {},
        });
      }
    }
    if (busy) {
      out.push({
        type: "item", id: "dl-busy", icon: Loader2,
        label: `Скачивание ${busy.toUpperCase()}…`, disabled: true, onSelect: () => {},
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formats, failed, busy]);

  return (
    <MenuCore
      anchor={anchor}
      onClose={onClose}
      elements={elements}
      side={side}
      width={310}
      ariaLabel="Скачивание трека"
      header={
        <MenuHeader
          cover={track.cover}
          title={track.title}
          subtitle={track.artist}
          fallbackIcon={Music}
        />
      }
    />
  );
}
