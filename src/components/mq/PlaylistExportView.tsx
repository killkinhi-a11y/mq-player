"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Copy, Image as ImageIcon, X, Check, Loader2 } from "lucide-react";

interface PlaylistExportViewProps {
  isOpen: boolean;
  onClose: () => void;
  playlistName: string;
  tracks: Track[];
  cover?: string;
}

export default function PlaylistExportView({
  isOpen,
  onClose,
  playlistName,
  tracks,
  cover,
}: PlaylistExportViewProps) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "generating" | "saved">("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const totalMinutes = Math.floor(totalDuration / 60);
  const trackCount = tracks.length;

  const pluralize = (n: number) => {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return `${n} треков`;
    if (last > 1 && last < 5) return `${n} трека`;
    if (last === 1) return `${n} трек`;
    return `${n} треков`;
  };

  const pluralizeMin = (n: number) => {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return `${n} мин`;
    if (last > 1 && last < 5) return `${n} мин`;
    if (last === 1) return `${n} мин`;
    return `${n} мин`;
  };

  // ── Text export ──
  const handleCopyText = useCallback(async () => {
    setStatus("copying");
    try {
      let text = `🎵 ${playlistName}\n\n`;
      tracks.forEach((track, i) => {
        const dur = track.duration ? formatDuration(track.duration) : "";
        text += `${i + 1}. ${track.artist} — ${track.title}${dur ? ` (${dur})` : ""}\n`;
      });
      text += `\n${pluralize(trackCount)} • ${pluralizeMin(totalMinutes)}\n`;
      text += `\nShared via MQ Player`;

      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("idle");
    }
  }, [playlistName, tracks, trackCount, totalMinutes]);

  // ── Image export ──
  const loadCoverImage = (src: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
      // Timeout for slow/blocked images
      setTimeout(() => resolve(null), 4000);
    });
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const handleExportImage = useCallback(async () => {
    setStatus("generating");
    try {
      const SIZE = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("idle");
        return;
      }

      // ── Background gradient ──
      const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
      gradient.addColorStop(0, "#1a0a0a");
      gradient.addColorStop(0.5, "#0e0e0e");
      gradient.addColorStop(1, "#0a0a1a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // ── Subtle accent glow ──
      const glowGrad = ctx.createRadialGradient(SIZE * 0.3, SIZE * 0.2, 0, SIZE * 0.3, SIZE * 0.2, SIZE * 0.6);
      glowGrad.addColorStop(0, "rgba(224, 49, 49, 0.15)");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // ── Cover collage (2x2 grid of first 4 covers, or single cover) ──
      const coverTracks = tracks.filter((t) => t.cover).slice(0, 4);
      const useCollage = coverTracks.length >= 4;
      const mainCover = cover || coverTracks[0]?.cover || "";

      const collageSize = 320;
      const collageX = SIZE / 2 - (useCollage ? collageSize : collageSize / 2);
      const collageY = 80;

      if (useCollage) {
        // 2x2 grid
        const singleSize = collageSize / 2 - 4;
        const loadedImages: (HTMLImageElement | null)[] = [];
        for (const track of coverTracks) {
          const img = await loadCoverImage(track.cover);
          loadedImages.push(img);
        }

        // Draw background for collage
        ctx.save();
        drawRoundedRect(ctx, collageX, collageY, collageSize, collageSize, 20);
        ctx.fillStyle = "#1a1a1a";
        ctx.fill();
        ctx.clip();

        for (let i = 0; i < 4; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const ix = collageX + col * (singleSize + 8) + 4;
          const iy = collageY + row * (singleSize + 8) + 4;
          if (loadedImages[i]) {
            ctx.drawImage(loadedImages[i]!, ix, iy, singleSize, singleSize);
          } else {
            ctx.fillStyle = "#222";
            ctx.fillRect(ix, iy, singleSize, singleSize);
          }
        }
        ctx.restore();
      } else if (mainCover) {
        const img = await loadCoverImage(mainCover);
        if (img) {
          ctx.save();
          drawRoundedRect(ctx, collageX + collageSize / 4, collageY, collageSize / 2, collageSize / 2, 16);
          ctx.fillStyle = "#1a1a1a";
          ctx.fill();
          ctx.clip();
          const aspect = img.width / img.height;
          let drawW = collageSize / 2;
          let drawH = collageSize / 2;
          if (aspect > 1) {
            drawH = drawW / aspect;
          } else {
            drawW = drawH * aspect;
          }
          const dx = collageX + collageSize / 4 + (collageSize / 2 - drawW) / 2;
          const dy = collageY + (collageSize / 2 - drawH) / 2;
          ctx.drawImage(img, dx, dy, drawW, drawH);
          ctx.restore();
        } else {
          // Fallback: draw music icon placeholder
          ctx.save();
          drawRoundedRect(ctx, collageX + collageSize / 4, collageY, collageSize / 2, collageSize / 2, 16);
          ctx.fillStyle = "#222";
          ctx.fill();
          ctx.fillStyle = "#444";
          ctx.font = "bold 48px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("♪", collageX + collageSize / 2, collageY + collageSize / 4);
          ctx.restore();
        }
      } else {
        // No cover at all - draw placeholder
        ctx.save();
        const phX = collageX + collageSize / 4;
        const phY = collageY;
        const phW = collageSize / 2;
        const phH = collageSize / 2;
        drawRoundedRect(ctx, phX, phY, phW, phH, 16);
        ctx.fillStyle = "#222";
        ctx.fill();
        ctx.fillStyle = "#555";
        ctx.font = "bold 48px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("♫", phX + phW / 2, phY + phH / 2);
        ctx.restore();
      }

      // ── Playlist name ──
      ctx.fillStyle = "#f5f5f5";
      ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Truncate name if too long
      let displayName = playlistName;
      while (ctx.measureText(displayName).width > SIZE - 120 && displayName.length > 3) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== playlistName) displayName += "…";

      ctx.fillText(displayName, 60, 460);

      // ── Track info ──
      ctx.fillStyle = "#888";
      ctx.font = "28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const infoText = `${pluralize(trackCount)} • ${pluralizeMin(totalMinutes)}`;
      ctx.fillText(infoText, 60, 530);

      // ── Track list (up to 8 tracks) ──
      ctx.fillStyle = "#ccc";
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const listTracks = tracks.slice(0, 8);
      let listY = 600;
      for (let i = 0; i < listTracks.length; i++) {
        const t = listTracks[i];
        const dur = t.duration ? formatDuration(t.duration) : "";
        let line = `${i + 1}. ${t.artist} — ${t.title}`;
        while (ctx.measureText(line).width > SIZE - 160 && line.length > 5) {
          line = line.slice(0, -1);
        }
        if (line !== `${i + 1}. ${t.artist} — ${t.title}`) line += "…";

        ctx.fillStyle = "#aaa";
        ctx.fillText(line, 60, listY);

        if (dur) {
          ctx.fillStyle = "#666";
          ctx.textAlign = "right";
          ctx.fillText(dur, SIZE - 60, listY);
          ctx.textAlign = "left";
        }
        listY += 40;
      }

      if (tracks.length > 8) {
        ctx.fillStyle = "#666";
        ctx.font = "22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(`+ ещё ${tracks.length - 8} треков`, 60, listY + 8);
      }

      // ── Watermark ──
      ctx.fillStyle = "rgba(224, 49, 49, 0.8)";
      ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("mq player", SIZE / 2, SIZE - 40);

      // ── Subtle top border line ──
      ctx.strokeStyle = "rgba(224, 49, 49, 0.3)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(60, 440);
      ctx.lineTo(SIZE - 60, 440);
      ctx.stroke();

      // ── Download ──
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setStatus("idle");
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${playlistName.replace(/[^a-zA-Zа-яА-Я0-9]/g, "_")}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 2500);
        },
        "image/png",
        1.0
      );
    } catch {
      setStatus("idle");
    }
  }, [playlistName, tracks, cover, trackCount, totalMinutes]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--mq-text)" }}
              >
                Экспорт плейлиста
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Playlist info */}
            <div className="space-y-1">
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--mq-text)" }}
              >
                {playlistName}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--mq-text-muted)" }}
              >
                {pluralize(trackCount)} • {pluralizeMin(totalMinutes)}
              </p>
            </div>

            {/* Export buttons */}
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleCopyText}
                disabled={status === "copying" || status === "generating"}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-colors"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color:
                    status === "copied"
                      ? "#4ade80"
                      : status === "copying"
                      ? "var(--mq-text-muted)"
                      : "var(--mq-text)",
                }}
              >
                {status === "copying" ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : status === "copied" ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <Copy className="w-6 h-6" />
                )}
                <span className="text-xs font-medium">
                  {status === "copying"
                    ? "Копирование..."
                    : status === "copied"
                    ? "Скопировано!"
                    : "Текст"}
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleExportImage}
                disabled={status === "generating" || status === "copying"}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-colors"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color:
                    status === "saved"
                      ? "#4ade80"
                      : status === "generating"
                      ? "var(--mq-text-muted)"
                      : "var(--mq-text)",
                }}
              >
                {status === "generating" ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : status === "saved" ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <ImageIcon className="w-6 h-6" />
                )}
                <span className="text-xs font-medium">
                  {status === "generating"
                    ? "Генерация..."
                    : status === "saved"
                    ? "Сохранено!"
                    : "Картинка"}
                </span>
              </motion.button>
            </div>

            {/* Preview text */}
            {status === "idle" && (
              <p
                className="text-[11px] text-center"
                style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}
              >
                Скопируйте как текст или скачайте как изображение 1080×1080
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
