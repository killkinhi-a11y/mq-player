"use client";

/**
 * Audio Debug Panel — live view into the Rust/WASM audio pipeline.
 * Shows the REAL measurements published by the engine: backend state, ABI,
 * SIMD, sample rates, frames processed, RMS/peak (proof of real signal),
 * underruns, DSP time per block, buffer level, limiter gain reduction.
 *
 * Data source: window.__mqWasmAudio (wasm-audio/diagnostics.ts) — the same
 * object DevTools automation reads, so what the panel shows is provable.
 *
 * Visibility: DEVELOPMENT builds only (NODE_ENV === "development").
 * Production never ships this surface — no query param, no localStorage
 * opt-in (Step 2 requirement). The underlying data object
 * (window.__mqWasmAudio) remains published for DevTools automation —
 * state only, no UI, no console noise.
 */

import { useEffect, useState, useCallback } from "react";
import { AudioWaveform, X, ChevronDown } from "lucide-react";
import { getWasmDiagnostics, isWasmActive, currentPlaybackPosition, getActiveWasmBackend, type WasmAudioDiagnostics } from "@/lib/wasm-audio";
import { pbMetrics } from "@/lib/playbackTimeline";
import { requestRegistryStats } from "@/lib/net/requestRegistry";
import { prefetchState } from "@/lib/playback/prefetch";
import { clockStats } from "@/lib/playback/clock";
import { useAppStore } from "@/store/useAppStore";

function debugEnabled(): boolean {
  // Strict dev-only: production builds never render this panel — the
  // ?audio-debug=1 / localStorage backdoor was removed (Step 2).
  return process.env.NODE_ENV === "development";
}

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (!Number.isFinite(n)) return "∞";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "G";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(digits);
}

function Row({ label, value, warn, ok }: { label: string; value: string; warn?: boolean; ok?: boolean }) {
  const color = warn ? "#f59e0b" : ok ? "#22c55e" : "var(--mq-text-muted, #8a8a8a)";
  return (
    <div className="flex items-center justify-between gap-3 leading-5">
      <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted, #8a8a8a)" }}>{label}</span>
      <span className="mq-t-meta-2 font-mono tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export default function AudioDebugPanel() {
  // Client-only (AppShell renders this tree ssr:false) — safe lazy init.
  const [enabled] = useState(() => debugEnabled());
  // Collapsed by default — the pill is enough at rest; expand on demand.
  const [open, setOpen] = useState(false);
  // Session-dismiss: X hides the pill entirely (debugEnabled() stays untouched,
  // so a reload/param re-enables it — no persisted state mutated by the X).
  const [dismissed, setDismissed] = useState(false);
  const [d, setD] = useState<WasmAudioDiagnostics>(() => getWasmDiagnostics());
  // V3 §29 diagnostics: TT* metrics + request registry + prefetch + clock.
  const [tt, setTt] = useState(() => pbMetrics());
  const [reg, setReg] = useState(() => requestRegistryStats());
  const [pf, setPf] = useState(() => prefetchState());
  const [ck, setCk] = useState(() => clockStats());

  useEffect(() => {
    const t = setInterval(() => {
      setD({ ...getWasmDiagnostics() });
      setTt(pbMetrics());
      setReg(requestRegistryStats());
      setPf(prefetchState());
      setCk(clockStats());
    }, 500);
    return () => clearInterval(t);
  }, []);

  const handleToggle = useCallback(() => setOpen(o => !o), []);
  const handleDismiss = useCallback(() => setDismissed(true), []);
  if (!enabled || dismissed) return null;

  const active = isWasmActive();
  const frames = d.framesProcessed;
  const rmsOk = typeof d.rms === "number" && d.rms > 0.0001;
  const limiterWorking = typeof d.gainReductionDb === "number" && d.gainReductionDb < -0.05;

  return (
    <div
      className="fixed right-3 bottom-24 z-[90] w-64 rounded-2xl overflow-hidden select-none"
      style={{
        backgroundColor: "color-mix(in srgb, var(--mq-card, #141414) 96%, transparent)",
        border: "1px solid var(--mq-border-thin, #2a2a2a)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: open ? "1px solid var(--mq-border-hairline, #222)" : "none" }}
        aria-expanded={open}
      >
        <AudioWaveform className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--mq-accent, #e03131)" }} />
        <span className="mq-t-meta-2 font-semibold flex-1 text-left" style={{ color: "var(--mq-text, #eee)" }}>
          Audio Engine
        </span>
        <span
          className="mq-t-meta-2 font-mono px-1.5 py-0.5 rounded-md"
          style={{
            color: active ? "#22c55e" : "#f59e0b",
            backgroundColor: active ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
          }}
        >
          {active ? "WASM ACTIVE" : "ELEMENT"}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} /> : null}
      </button>

      {open && (
        <div className="px-3 py-2 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
          <Row label="Backend" value={d.backend} ok={d.backend === "wasm"} warn={d.backend !== "wasm"} />
          <Row label="Active" value={String(d.active)} ok={d.active} warn={!d.active} />
          <Row label="Engine tag" value={d.tag || "—"} />
          <Row label="ABI / SIMD" value={`${d.abiVersion ?? "—"} / ${d.simd ? "yes" : "no"}`} ok={d.abiVersion === 3} warn={d.abiVersion !== 3 && d.active} />
          <Row label="Sample rate" value={d.contentSampleRate ? `${d.contentSampleRate} → ${d.contextSampleRate}` : "—"} />
          <Row label="Channels" value={d.channels ? String(d.channels) : "—"} />
          <Row label="Frames processed" value={fmtNum(frames, 0)} ok={frames > 0} warn={active && frames === 0} />
          <Row label="Buffer (frames)" value={fmtNum(d.bufferLevel, 0)} />
          <Row label="Underruns" value={String(d.underruns)} warn={d.underruns > 100} ok={d.underruns === 0} />
          <Row label="RMS" value={typeof d.rms === "number" ? `${(20 * Math.log10(Math.max(d.rms, 1e-9))).toFixed(1)} dBFS` : "—"} ok={rmsOk} warn={active && !rmsOk} />
          <Row label="Peak" value={typeof d.peak === "number" ? `${(20 * Math.log10(Math.max(d.peak, 1e-9))).toFixed(1)} dBFS` : "—"} ok={(d.peak ?? 0) > 0.001} />
          <Row label="True peak" value={typeof d.truePeakDb === "number" ? `${d.truePeakDb.toFixed(1)} dBFS` : "—"} />
          <Row label="LUFS-S (short-term)" value={typeof d.lufsShort === "number" ? d.lufsShort.toFixed(1) : "—"} />
          <Row label="Limiter GR" value={typeof d.gainReductionDb === "number" ? `${d.gainReductionDb.toFixed(1)} dB` : "—"} ok={limiterWorking} />
          <Row label="DSP avg/block" value={d.avgProcessNs ? `${(d.avgProcessNs / 1000).toFixed(1)} µs` : "—"} />
          <Row label="DSP max/block" value={d.maxProcessNs ? `${(d.maxProcessNs / 1000).toFixed(1)} µs` : "—"} />
          <Row label="Last error" value={d.lastError ?? "none"} warn={!!d.lastError} />
          {/* ── V3 §29: player metrics + diagnostics ── */}
          <div className="mq-t-badge mt-1.5 mb-0.5" style={{ color: "var(--mq-accent, #e03131)" }}>V3 · PLAYER METRICS</div>
          {(() => {
            const st = useAppStore.getState();
            const t = st.currentTrack;
            return (
              <>
                <Row label="Current track" value={t ? `${t.title.slice(0, 26)} · ${t.artist.slice(0, 16)}` : "—"} />
                <Row label="Provider" value={`${t?.catalogProvider ?? t?.source ?? "—"} → ${t?.playbackProvider ?? (t?.scTrackId ? "soundcloud" : "—")}`} />
                <Row label="Match confidence" value={t?._resolveConfidence != null ? `${Math.round((t._resolveConfidence as number) * 100)}%` : "—"} />
                <Row label="Full-length" value={t?.scStreamPolicy ? (t.scStreamPolicy === "ALLOW" ? "yes" : "PREVIEW (SNIP)") : "—"} warn={t?.scStreamPolicy === "SNIP"} ok={t?.scStreamPolicy === "ALLOW"} />
                <Row label="Current time" value={`${currentPlaybackPosition().toFixed(1)}s / ${(st.duration || 0).toFixed(0)}s`} />
                <Row label="Buffer" value={(() => {
                  try {
                    const b = getActiveWasmBackend() as unknown as { stats?: { bufferedFrames?: number }; ctx?: { sampleRate?: number } } | null;
                    if (b?.stats?.bufferedFrames != null && b.ctx?.sampleRate) return `${(b.stats.bufferedFrames / b.ctx.sampleRate).toFixed(1)}s (wasm)`;
                  } catch {}
                  return `${d.bufferLevel ? Math.round(d.bufferLevel) + " frames" : "—"}`;
                })()} />
              </>
            );
          })()}
          <Row label="TTPlayIntent" value={tt.TTPlayIntentMs != null ? `${tt.TTPlayIntentMs} ms` : "—"} />
          <Row label="TTSourceResolve" value={tt.TTSourceResolveMs != null ? `${tt.TTSourceResolveMs} ms` : "—"} warn={(tt.TTSourceResolveMs ?? 0) > 2500} />
          <Row label="TTFirstAudio" value={tt.TTFirstAudioMs != null ? `${tt.TTFirstAudioMs} ms` : "—"} warn={(tt.TTFirstAudioMs ?? 0) > 4000} />
          <Row label="TTReady" value={tt.TTReadyMs != null ? `${tt.TTReadyMs} ms` : "—"} />
          <Row label="TTPlaybackStart" value={tt.TTPlaybackStartMs != null ? `${tt.TTPlaybackStartMs} ms` : "—"} ok={(tt.TTPlaybackStartMs ?? 9999) < 2000} warn={(tt.TTPlaybackStartMs ?? 0) > 5000} />
          <div className="mq-t-badge mt-1.5 mb-0.5" style={{ color: "var(--mq-accent, #e03131)" }}>V3 · REQUESTS / PREFETCH / CLOCK</div>
          <Row label="Requests in-flight" value={String(reg.inflight)} warn={reg.inflight > 6} ok={reg.inflight <= 3} />
          <Row label="Dedup hits" value={String(reg.dedupHits)} ok={reg.dedupHits > 0} />
          <Row label="Cache hits" value={String(reg.cacheHits)} ok={reg.cacheHits > 0} />
          <Row label="Aborted (stale)" value={String(reg.aborted)} ok={reg.aborted >= 0} />
          <Row label="Prefetch active" value={`${pf.active} · hits ${pf.hits} / miss ${pf.misses}`} ok={pf.hits > 0} />
          <Row label="PlaybackClock" value={`${ck.subscribers} surfaces · ${ck.running ? "running" : "idle"}`} ok={ck.subscribers > 0} warn={ck.subscribers === 0} />
          <Row label="Skip events" value={String(useAppStore.getState().listeningEvents?.length ?? 0)} />
          <div className="mq-t-badge mt-1" style={{ color: "var(--mq-text-muted, #777)" }}>
            window.__mqTimeline.report() / .metrics()
          </div>
          <div className="mq-t-badge mt-1" style={{ color: "var(--mq-text-muted, #777)" }}>
            window.__mqWasmAudio
          </div>
        </div>
      )}

      {!open && (
        <button onClick={handleDismiss} className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--mq-overlay-hover)] transition-colors" aria-label="Скрыть панель">
          <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
    </div>
  );
}
