"use client";

import { useState, useCallback, useMemo, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Share2, Download, LinkIcon, QrCode } from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { toast } from "@/hooks/use-toast";

/**
 * ShareSheet — share dialog with a REAL scannable QR code.
 *
 * v78: the old decorative hash-pattern "QR" (which admitted it was not a
 * real code) is replaced by qrcode.react — spec-compliant generation:
 *   - Error Correction Level H (30% recoverability — keeps the small
 *     center artwork safe)
 *   - marginSize 4 (spec quiet zone) + the white pad adds extra margin
 *   - near-black modules (#0d0d0f) on pure white — ~19:1 contrast;
 *     dark/premium comes from the chrome, never from inverting the code
 *   - the QR encodes the CANONICAL public URL (lib/share-urls.ts) —
 *     same link web, Android and the QR carry
 *
 * Download = pure logo-less PNG at 512px (max scannability).
 * url=null (demo/local content): no fake QR — honest message + fallback
 * share actions (§25.9).
 */

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  title: string;
  subtitle?: string;
  cover?: string;
}

export const ShareSheet = memo(function ShareSheet({
  isOpen,
  onClose,
  url,
  title,
  subtitle,
  cover,
}: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleCopy = useCallback(() => {
    if (!url || !navigator.clipboard) {
      if (!url) toast({ title: "Нет ссылки для копирования", variant: "destructive" });
      else toast({ title: "Браузер не поддерживает копирование", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast({ title: "Ссылка скопирована" });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    });
  }, [url]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      // No public URL → share the text itself (title — artist)
      await navigator.share(url ? { title, url } : { title, text: subtitle ? `${title} — ${subtitle}` : title });
    } catch {
      /* user dismissed */
    }
  }, [title, subtitle, url]);

  const handleDownloadQR = useCallback(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !url) return;
    try {
      const link = document.createElement("a");
      link.download = `qr-${(title || "mq").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 40)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      toast({ title: "Не удалось сохранить QR", variant: "destructive" });
    }
  }, [title, url]);

  // QR re-renders only when the share target changes (§25.10).
  const qrNode = useMemo(() => {
    if (!url) return null;
    return (
      <QRCodeSVG
        id="share-qr-svg"
        value={url}
        size={200}
        level="H"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#0d0d0f"
        title={`QR: ${url}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    );
  }, [url]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: "var(--mq-overlay-scrim)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Поделиться"
        >
          <motion.div
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-[20px] overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "var(--mq-shadow-dramatic)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — long-title contract: min-w-0 text + shrink-0 close */}
            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--mq-border-hairline)" }}>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
                  <Share2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>Поделиться</h3>
                  <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>{title}</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Закрыть" className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {url ? (
              <>
                {/* Content preview (§25.4: artwork + title + artist) */}
                <div className="px-5 pt-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0" style={{ border: "1px solid var(--mq-edge)", backgroundColor: "var(--mq-surface-2)" }}>
                    {cover ? (
                      <img src={cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--mq-text-muted)" }}>
                        <QrCode className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{title}</p>
                    {subtitle && (
                      <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>
                    )}
                  </div>
                </div>

                {/* QR — real, scannable: ECC H + 4-module quiet zone + white pad */}
                <div className="px-5 py-5 flex flex-col items-center gap-3">
                  <div
                    className="rounded-2xl p-[10px]"
                    style={{
                      backgroundColor: "#ffffff",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.35), 0 0 0 1px color-mix(in srgb, var(--mq-accent) 18%, transparent)",
                      width: "min(64vw, 220px)",
                    }}
                  >
                    <div className="relative">
                      {qrNode}
                      {/* Small center artwork — ≤ 20% of the code, solid
                          white chip so modules never bleed through; ECC H
                          keeps this fully scannable. */}
                      {cover && (
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl overflow-hidden flex items-center justify-center"
                          style={{ width: 42, height: 42, backgroundColor: "#ffffff", border: "2px solid #ffffff", boxShadow: "0 2px 8px rgba(0,0,0,0.28)" }}
                        >
                          <img src={cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mq-t-meta-2 text-center" style={{ color: "var(--mq-text-muted)" }}>
                    Наведите камеру — откроется в MQ
                  </p>
                  <p className="mq-t-num mq-t-meta-2 text-center break-all px-2" style={{ color: "color-mix(in srgb, var(--mq-text-muted) 70%, transparent)" }}>
                    {url.replace(/^https?:\/\//, "")}
                  </p>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 space-y-2">
                  <motion.button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mq-icon-btn"
                    style={{ ["--mq-rest-bg" as string]: "var(--mq-glass-bg)" }}
                  >
                    {copied ? <Check className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> : <Copy className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />}
                    <span className="text-sm flex-1 text-left truncate" style={{ color: "var(--mq-text)" }}>
                      {copied ? "Скопировано!" : url.replace(/^https?:\/\//, "")}
                    </span>
                  </motion.button>

                  <motion.button
                    onClick={handleDownloadQR}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mq-icon-btn"
                    style={{ ["--mq-rest-bg" as string]: "var(--mq-glass-bg)" }}
                  >
                    <Download className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-sm flex-1 text-left" style={{ color: "var(--mq-text)" }}>Скачать QR код</span>
                  </motion.button>

                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <motion.button
                      onClick={handleNativeShare}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
                    >
                      <Share2 className="w-4 h-4" />
                      <span className="text-sm font-semibold flex-1 text-left">Поделиться через...</span>
                    </motion.button>
                  )}
                </div>

                {/* Hidden 512px logo-less canvas — the download source */}
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={url}
                  size={512}
                  level="H"
                  marginSize={4}
                  bgColor="#ffffff"
                  fgColor="#0d0d0f"
                  style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                  aria-hidden="true"
                />
              </>
            ) : (
              /* §25.9 — no public URL: no fake QR, honest state, working fallbacks */
              <div className="px-5 py-6 flex flex-col items-center gap-3 text-center">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}>
                  <LinkIcon className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Нет публичной ссылки
                  </p>
                  <p className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Этот контент доступен только внутри MQ — для него нельзя создать QR-код
                  </p>
                </div>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <motion.button
                    onClick={handleNativeShare}
                    className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="text-sm font-semibold flex-1 text-left">Поделиться через...</span>
                  </motion.button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
