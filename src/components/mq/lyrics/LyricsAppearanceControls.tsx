"use client";

/**
 * LyricsAppearanceControls — the ONE control set for lyrics typography
 * (spec §4): font upload/list/preview/select/delete + size, weight,
 * line-height, letter-spacing. Used in two places:
 *   - SettingsView → «Текст песни» card (variant="settings")
 *   - FullscreenLyrics → quick "Aa" popover (variant="popover")
 *
 * Font files live in IndexedDB (mq-custom-fonts); the selected family and
 * numeric prefs live in the store (persisted locally).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Trash2, Check, Type, AlertTriangle, Loader2,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
  listFonts, saveFontFile, deleteFont, ensureFontsLoaded,
  type StoredFontMeta, MAX_FONT_SIZE,
} from "@/lib/customFonts";
import { formatBytes } from "@/lib/download/downloadService";

const FONT_EXTS = ".woff2,.woff,.ttf,.otf";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="mq-t-meta text-[13px]" style={{ color: "var(--mq-text)" }}>{label}</p>
        {hint ? <p className="mq-t-meta-2 text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{hint}</p> : null}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

function NumSlider({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="mq-t-meta-2 text-[12px]" style={{ color: "var(--mq-text-muted)" }}>{label}</span>
        <span className="mq-t-num text-[12px]" style={{ color: "var(--mq-accent)" }}>{value === 0 ? "авто" : fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mq-lyr-slider w-full"
        style={{ ["--mq-seek-pct" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  );
}

export function LyricsAppearanceControls({ variant = "settings" }: { variant?: "settings" | "popover" }) {
  const family = useAppStore((s) => s.lyricsFontFamily);
  const size = useAppStore((s) => s.lyricsFontSize);
  const weight = useAppStore((s) => s.lyricsFontWeight);
  const lineHeight = useAppStore((s) => s.lyricsLineHeight);
  const letterSpacing = useAppStore((s) => s.lyricsLetterSpacing);
  const animated = useAppStore((s) => s.lyricsAnimated);
  const setFamily = useAppStore((s) => s.setLyricsFontFamily);
  const setSize = useAppStore((s) => s.setLyricsFontSize);
  const setWeight = useAppStore((s) => s.setLyricsFontWeight);
  const setLineHeight = useAppStore((s) => s.setLyricsLineHeight);
  const setLetterSpacing = useAppStore((s) => s.setLyricsLetterSpacing);
  const setAnimated = useAppStore((s) => s.setLyricsAnimated);

  const [fonts, setFonts] = useState<StoredFontMeta[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const list = await listFonts();
    setFonts(list);
    // Prune a selected family whose font was deleted (e.g. from another tab).
    if (family && !list.some((f) => f.family === family)) {
      const st = useAppStore.getState();
      if (st.lyricsFontFamily === family) st.setLyricsFontFamily("");
    }
  }, [family]);

  useEffect(() => {
    void ensureFontsLoaded().then(refresh).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploadError(null);
      setUploading(true);
      const res = await saveFontFile(file.name.replace(/\.[^.]+$/, ""), file);
      setUploading(false);
      if (res.ok) {
        await refresh();
        setFamily(res.meta.family); // auto-select the fresh font
        if (fileRef.current) fileRef.current.value = "";
      } else {
        const msg =
          res.error === "too_large"
            ? `Файл больше ${formatBytes(MAX_FONT_SIZE)}`
            : res.error === "invalid_extension"
              ? "Поддерживаются .woff2, .woff, .ttf, .otf"
              : res.error === "invalid_format"
                ? "Файл не похож на шрифт (проверьте содержимое)"
                : "Не удалось прочитать файл";
        setUploadError(msg);
      }
    },
    [refresh, setFamily],
  );

  const compact = variant === "popover";
  const previewStyle: React.CSSProperties = {
    // Same fallback chain as --ll-font-family: var() fallbacks must never
    // contain CSS-wide keywords (`inherit` invalidates the declaration).
    fontFamily: family ? `"${family}", var(--mq-font-primary, sans-serif)` : undefined,
    fontSize: size > 0 ? size : compact ? 22 : 26,
    fontWeight: weight > 0 ? weight : 700,
    lineHeight: lineHeight > 0 ? lineHeight : 1.3,
    letterSpacing: letterSpacing !== 0 ? `${letterSpacing}em` : undefined,
  };

  return (
    <div className={compact ? "space-y-1" : "space-y-2"} data-mq-lyrics-appearance>
      {/* Live preview */}
      <div
        className="rounded-xl px-3 py-3 overflow-hidden"
        style={{
          background: "var(--mq-glass-bg)",
          border: "1px solid var(--mq-border-hairline)",
        }}
        aria-hidden="true"
      >
        <p className="truncate" style={{ ...previewStyle, color: "var(--mq-text)" }}>
          Слушай музыку — MQ
        </p>
      </div>

      {/* Font list: default + uploaded */}
      <div role="radiogroup" aria-label="Шрифт текста песни">
        <button
          type="button"
          role="radio"
          aria-checked={!family}
          onClick={() => setFamily("")}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors"
          style={{
            background: !family ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
            border: `1px solid ${!family ? "color-mix(in srgb, var(--mq-accent) 32%, transparent)" : "var(--mq-border-hairline)"}`,
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Type className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            <span className="mq-t-meta text-[13px] truncate" style={{ color: "var(--mq-text)" }}>По умолчанию (MQ)</span>
          </span>
          {!family && <Check className="w-4 h-4 shrink-0" style={{ color: "var(--mq-accent)" }} />}
        </button>

        {fonts.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 px-3 py-2 mt-1.5 rounded-lg"
            style={{
              background: family === f.family ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
              border: `1px solid ${family === f.family ? "color-mix(in srgb, var(--mq-accent) 32%, transparent)" : "var(--mq-border-hairline)"}`,
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={family === f.family}
              onClick={() => setFamily(f.family)}
              className="flex-1 min-w-0 text-left"
              aria-label={`Шрифт ${f.displayName}`}
            >
              <span
                className="block truncate"
                style={{ fontFamily: `"${f.family}", sans-serif`, color: "var(--mq-text)", fontSize: 15 }}
              >
                {f.displayName}
              </span>
              <span className="mq-t-meta-2 text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                {f.format.toUpperCase()} · {formatBytes(f.size)}
              </span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteFont(f.id);
                await refresh();
              }}
              aria-label={`Удалить шрифт ${f.displayName}`}
              className="mq-icon-btn w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Upload */}
      <label
        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
        style={{
          border: `1px dashed ${uploadError ? "var(--mq-error)" : "var(--mq-border-medium)"}`,
          color: "var(--mq-text)",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={FONT_EXTS}
          className="opacity-0 absolute w-0 h-0"
          aria-label="Загрузить шрифт"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
        ) : (
          <Upload className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        )}
        <span className="mq-t-meta text-[13px]">{uploading ? "Загрузка…" : "Загрузить шрифт (.woff2 .woff .ttf .otf)"}</span>
      </label>
      {uploadError && (
        <p className="flex items-center gap-1.5 text-[12px] px-1" style={{ color: "var(--mq-error)" }} role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {uploadError}
        </p>
      )}

      {/* Numeric prefs */}
      {!compact && (
        <div className="pt-1" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
          <NumSlider label="Размер" value={size} min={0} max={48} step={1} onChange={setSize} fmt={(v) => `${v}px`} />
          <NumSlider label="Насыщенность" value={weight} min={0} max={900} step={100} onChange={setWeight} fmt={(v) => String(v)} />
          <NumSlider label="Межстрочный интервал" value={lineHeight} min={0} max={2.4} step={0.05} onChange={setLineHeight} fmt={(v) => v.toFixed(2)} />
          <NumSlider label="Межбуквенный интервал" value={letterSpacing} min={-0.05} max={0.2} step={0.01} onChange={setLetterSpacing} fmt={(v) => `${v.toFixed(2)}em`} />
          <Row label="Анимированный текст" hint="Караоке-заливка активной строки. Отключите, если анимация мешает">
            <button
              type="button"
              role="switch"
              aria-checked={animated}
              aria-label="Анимированный текст песни"
              onClick={() => setAnimated(!animated)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ backgroundColor: animated ? "var(--mq-accent)" : "var(--mq-glass-active)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: animated ? 22 : 2 }}
              />
            </button>
          </Row>
        </div>
      )}

      {compact && (
        <div className="pt-1" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
          <NumSlider label="Размер" value={size} min={0} max={48} step={1} onChange={setSize} fmt={(v) => `${v}px`} />
          <NumSlider label="Межстрочный интервал" value={lineHeight} min={0} max={2.4} step={0.05} onChange={setLineHeight} fmt={(v) => v.toFixed(2)} />
        </div>
      )}
    </div>
  );
}
