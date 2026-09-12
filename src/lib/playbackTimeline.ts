/**
 * playbackTimeline.ts — T0..T11 first-play instrumentation (P0 long-load).
 *
 * REAL measurement only. No skeletons, no fake progress, no masking.
 * One entry per track-load attempt; stages map to the task-book timeline:
 *
 *   T0  click               (store.playTrack, after resume-guard)
 *   T1  track-selected      (engine loadTrack start)
 *   T2  metadata lookup     (resolveSoundCloudStream fetch start)
 *   T3  API response        (stream API headers received)
 *   T4  URL resolution      (stream JSON parsed)
 *   T5  network start       (hls.loadSource / audioEl.src + load)
 *   T6  first byte         (HLS manifest loaded / audio loadstart+first data)
 *   T7  audio metadata      (loadedmetadata)
 *   T8  decoder ready       (canplay / FRAG_BUFFERED)
 *   T9  engine ready        (AudioContext resumed)
 *   T10 first playable      (currentTime > 0)
 *   T11 playback start      ('playing' event)
 *
 * Network truth source: PerformanceResourceTiming (duration + transferSize
 * + serverTiming from our Server-Timing headers) for /api/music/soundcloud/*
 * and audio media — captured at T11, so the report shows the full waterfall
 * including duplicate requests.
 *
 * Usage: window.__mqTimeline.get() / .report() / .reset()
 */

export type PbStage =
  | "T0-click" | "T1-track-selected"
  | "T2-resolve-start" | "T3-api-headers" | "T4-url-resolved"
  | "T5-network-start" | "T6-first-byte" | "T7-audio-metadata"
  | "T8-decoder-ready" | "T9-engine-ready" | "T10-first-playable"
  | "T11-playback-start";

export interface PbMark {
  stage: string;
  t: number;           // performance.now() ms
  detail?: string;
}

export interface PbNetworkEntry {
  url: string;
  initiator: string;
  duration: number;    // ms
  transferSize: number;
  serverTiming?: string; // raw Server-Timing header value if present
}

export interface PbEntry {
  id: number;
  trackId: string;
  title: string;
  t0: number;          // performance.now() at T0
  marks: PbMark[];
  network: PbNetworkEntry[];
  done: boolean;
  failed?: string;
}

const MAX_ENTRIES = 30;

function safePerf(): number {
  try {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

interface PbGlobal {
  entries: PbEntry[];
  currentId: number;
  seq: number;
}

function g(): PbGlobal {
  const w = typeof window !== "undefined" ? (window as any) : undefined;
  if (!w) {
    // SSR / non-browser: no-op sink shared across calls
    return (globalThis as any).__pbSsrSink || ((globalThis as any).__pbSsrSink = { entries: [], currentId: -1, seq: 0 });
  }
  if (!w.__mqTimeline) {
    w.__mqTimeline = { entries: [], currentId: -1, seq: 0 };
  }
  return w.__mqTimeline;
}

function current(): PbEntry | null {
  const gl = g();
  if (gl.currentId < 0) return null;
  return gl.entries.find((e: PbEntry) => e.id === gl.currentId) || null;
}

/** Start a new timeline entry for a track-load attempt (T0). */
export function pbStart(trackId: string, title: string): void {
  const gl = g();
  const prev = current();
  if (prev && !prev.done) {
    prev.failed = "superseded";
    prev.done = true;
  }
  gl.seq += 1;
  const entry: PbEntry = {
    id: gl.seq,
    trackId,
    title,
    t0: safePerf(),
    marks: [{ stage: "T0-click", t: safePerf() }],
    network: [],
    done: false,
  };
  gl.entries.push(entry);
  if (gl.entries.length > MAX_ENTRIES) gl.entries.shift();
  gl.currentId = entry.id;
}

/** Add a stage mark to the current entry (silently ignored when none). */
export function pbMark(stage: string, detail?: string): void {
  const e = current();
  if (!e || e.done) return;
  // Keep the FIRST occurrence of a canonical stage.
  if (stage.startsWith("T") && e.marks.some((m) => m.stage === stage)) return;
  e.marks.push({ stage, t: safePerf(), detail });
}

export function pbFail(reason: string): void {
  const e = current();
  if (!e) return;
  e.failed = reason;
  e.done = true;
}

/** One-shot element listeners for T6..T11 on a given audio element. */
export function pbAttachElement(el: HTMLAudioElement): void {
  const entryId = g().currentId;
  if (entryId < 0) return;
  const isCurrent = () => g().currentId === entryId;

  const once = (stage: string, evt: string, detail?: string) => {
    el.addEventListener(evt, () => {
      if (!isCurrent()) return;
      pbMark(stage, detail);
      if (stage === "T11-playback-start") {
        finishReport();
      }
    }, { once: true });
  };

  once("T6-first-byte", "loadstart", "element");
  once("T7-audio-metadata", "loadedmetadata");
  once("T8-decoder-ready", "canplay");
  once("T11-playback-start", "playing");

  // T10: first timeupdate with currentTime > 0 (element path)
  const onTime = () => {
    if (!isCurrent()) { el.removeEventListener("timeupdate", onTime); return; }
    if (el.currentTime > 0) {
      pbMark("T10-first-playable", String(Math.round(el.currentTime * 100) / 100) + "s");
      el.removeEventListener("timeupdate", onTime);
    }
  };
  el.addEventListener("timeupdate", onTime);
}

/** HLS.js event marks (call from existing hls.on wiring). */
export function pbHls(event: string, detail?: string): void {
  const map: Record<string, string> = {
    "hls-manifest-loading": "T5-network-start",
    "hls-manifest-loaded": "T6-first-byte",
    "hls-key-loaded": "T6-key",
    "hls-frag-buffered": "T8-decoder-ready",
    "hls-error": "hls-error",
  };
  const stage = map[event] || event;
  pbMark(stage, detail);
}

/** Collect network waterfall for stream/proxy/license/audio URLs. */
function collectNetwork(entry: PbEntry): void {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (const r of entries) {
      const u = r.name;
      if (
        u.includes("/api/music/soundcloud/") ||
        u.includes("/api/demo/stream") ||
        u.includes("sndcdn.com") ||
        u.includes("/api/cobalt/")
      ) {
        let serverTiming = "";
        try {
          const st = (r as any).serverTiming as PerformanceServerTiming[] | undefined;
          if (st && st.length) serverTiming = st.map((s) => `${s.name};dur=${s.duration}`).join(", ");
        } catch {}
        entry.network.push({
          url: u.length > 110 ? u.slice(0, 107) + "..." : u,
          initiator: (r as any).initiatorType || "",
          duration: Math.round(r.duration),
          transferSize: r.transferSize || 0,
          serverTiming: serverTiming || undefined,
        });
      }
    }
  } catch {}
}

function finishReport(): void {
  const e = current();
  if (!e) return;
  e.done = true;
  collectNetwork(e);
  pbPrint(e);
}

/** Print one entry as a compact timeline + waterfall. */
export function pbPrint(e: PbEntry): void {
  const lines: string[] = [];
  lines.push(`%c[mq-timeline] #${e.id} "${e.title.slice(0, 40)}" ${e.failed ? "FAILED: " + e.failed : "OK"}`);
  const t0 = e.marks[0]?.t ?? e.t0;
  let prev = t0;
  for (const m of e.marks) {
    const delta = Math.round(m.t - t0);
    const step = Math.round(m.t - prev);
    prev = m.t;
    lines.push(`  ${m.stage.padEnd(22)} +${delta}ms (step ${step}ms)${m.detail ? " — " + m.detail : ""}`);
  }
  const total = Math.round(prev - t0);
  lines.push(`  ${"TOTAL".padEnd(22)} ${total}ms`);
  if (e.network.length) {
    lines.push("  network waterfall:");
    for (const n of e.network) {
      lines.push(`    ${String(n.duration).padStart(6)}ms ${String(n.transferSize).padStart(9)}B ${n.initiator.padEnd(8)} ${n.url}${n.serverTiming ? " [" + n.serverTiming + "]" : ""}`);
    }
    // duplicate URL detection
    const seen = new Map<string, number>();
    for (const n of e.network) seen.set(n.url, (seen.get(n.url) || 0) + 1);
    const dups = [...seen.entries()].filter(([, c]) => c > 1);
    if (dups.length) {
      lines.push("  DUPLICATE requests:");
      for (const [u, c] of dups) lines.push(`    x${c} ${u}`);
    }
  }
  console.log(lines.join("\n"), "color:#e8734a;font-weight:bold");
}

/** Public handle: window.__mqTimeline */
if (typeof window !== "undefined") {
  const w = window as any;
  w.__mqTimeline = w.__mqTimeline || { entries: [], currentId: -1, seq: 0 };
  const gl = w.__mqTimeline;
  gl.get = () => gl.entries.map((e: PbEntry) => ({
    id: e.id, trackId: e.trackId, title: e.title,
    total: Math.round((e.marks[e.marks.length - 1]?.t ?? e.t0) - e.t0),
    stages: e.marks.map((m) => `${m.stage}:+${Math.round(m.t - e.t0)}ms${m.detail ? "(" + m.detail + ")" : ""}`),
    failed: e.failed || null,
    networkCount: e.network.length,
    network: e.network,
  }));
  gl.report = () => gl.entries.forEach((e: PbEntry) => {
    if (!e.done) collectNetwork(e);
    pbPrint(e);
  });
  gl.reset = () => { gl.entries = []; gl.currentId = -1; gl.seq = 0; };
}
