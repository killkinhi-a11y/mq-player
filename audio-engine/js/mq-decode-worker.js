/**
 * MQ Audio Engine v2 — Decode Worker (non-realtime).
 *
 * Pipeline stage ownership (see audio-engine/docs/engine-v2-architecture.md):
 *   Fetcher          — HTTP Range windows, retry/resume, abort, seek coalescing
 *   SegmentCache     — per-URL LRU byte ranges (backward seeks / replays)
 *   Decoder          — codec_wasm (Symphonia) × up to 4 slots:
 *                      dec0 = active track, dec1 = next track (gapless)
 *   BoundaryTracker  — frame-exact track boundaries via MessagePort FIFO
 *   PCM validator    — NaN/DC/jump scan on every chunk (A11)
 *   Silence trim     — bounded LAME delay/padding polish at boundaries
 *   AdaptiveBuffer   — EWMA net/decode → queue target + refill priority
 *   Prefetch         — next-track bytes+decode by continuation lead (A10)
 *
 * Data plane: PCM → MessagePort transfers to the AudioWorklet (FIFO order is
 * the source of truth for boundary positions). Credit plane: cumulative
 * sliding window from the worklet (sequence space, never replaceable).
 *
 * Gapless continuation lifecycle (single place per transition):
 *   registered → fetching → ready(gapless? committed : aborted)
 *   at the boundary (A's PCM fully sent): marker message → ROTATE dec1→dec0
 *   → B becomes the active decoder; its in-flight fetch becomes the active
 *   fetch; accounting resets (credit space stays cumulative).
 *
 * Plain ES2019, DedicatedWorkerGlobalScope, no bundler.
 */
/* eslint-disable */

const SCRATCH_BYTES = 65536;   // shared push/pop marshalling region
const PUSH_SLICE = 32768;      // max bytes per mq_dec_push call
const POP_FRAMES = 8192;       // max frames per mq_dec_pop_pcm call
const RUST_QUEUE_CAP = 1 << 18; // hard decoder-queue cap (codec_wasm)
const DEFAULT_TARGET_SEC = 3;  // adaptive steady-state decoded target (min)
const MAX_TARGET_SEC = 5.9;    // bounded by the Rust queue cap @ 44.1 kHz
const TICK_MS = 250;           // pump/prefetch tick (worker-side, non-RT)
const SEEK_COALESCE_MS = 150;  // rapid-scrub refetch deferral
const CACHE_BUDGET_BYTES = 12 * 1024 * 1024; // SegmentCache LRU budget
const NEXT_READY_MIN_SEC = 2;  // decoded-ahead needed to declare next ready
// Boundary polish caps (LAME delay ~576, padding up to ~1 frame; bounded so
// tracks that legitimately start/end in silence keep their content).
// Threshold −80 dBFS.
const TRIM_THRESHOLD = 1e-4;
const TRIM_LEAD_FRAMES = 1152;
const TRIM_TAIL_FRAMES = 2304;

// ── engine state (module) ──
let ex = null;       // wasm exports
let mem = null;      // wasm memory
let pcmPort = null;  // MessagePort → AudioWorklet (data plane, FIFO)
let dec0 = null;     // ACTIVE decoder handle (0 is VALID — never truthiness)
let playing = false;
let abortCtrl = null;      // fetch AbortController for the ACTIVE stream
let loadSeq = 0;           // generation guard for async loads
let pcmGen = 0;            // generation stamped on every PCM message
let tickTimer = null;
let seekCoalesceTimer = null;
let pendingSeek = null;    // deferred by coalescing

// ── current-track accounting ──
let curTrack = null;  // {trackId, url, durationSec, rate, basePosSec}
let pushedBytes = 0;
let poppedFrames = 0;
let fetchStartByte = 0;
let totalBytes = 0;
let infoSent = false;
let activeEof = false;     // active decoder input EOF
let trackStartSent = 0;    // sentTotal at the current track's start
let pendingBoundary = false; // marker+rotation prepared
let boundaryMarked = false;  // marker sent for the pending boundary
let terminalSent = false;    // terminal fetchDone posted for this gen
let tailHold = null;         // held last chunk for tail trim
let drainedWaitMs = 0;       // safety net: ring drained while continuation stuck

// ── continuation (gapless next track) ──
let next = null; // {trackId,url,durationSec,leadSec,state,rate,channels,dec,ctrl,inputEof,readySent}
// states: registered → fetching → ready | aborted | failed

// ── flow accounting (credit protocol, cumulative sequence space) ──
let grantedTotal = 0;
let sentTotal = 0;

// ── diagnostics ──
let creditsIn = 0;
let chunksSent = 0;
let framesSent = 0;
let boundariesSent = 0;

// ── PCM health validator (A11) — per active generation ──
const health = {
  nanInf: 0, maxAbs: 0, maxDelta: 0, dcSum: 0, dcN: 0,
  zeroRunMax: 0, violations: 0,
  framesScanned: 0, chunksScanned: 0,
};
function resetHealth() {
  health.nanInf = 0; health.maxAbs = 0; health.maxDelta = 0;
  health.dcSum = 0; health.dcN = 0; health.zeroRunMax = 0;
  health.violations = 0; health.framesScanned = 0; health.chunksScanned = 0;
}
function scanChunk(l, r) {
  const n = l.length;
  let prev = 0;
  let zeroRun = 0;
  for (let i = 0; i < n; i++) {
    const a = l[i];
    const b = i < r.length ? r[i] : a;
    if (a !== a || b !== b || !isFinite(a) || !isFinite(b)) { health.nanInf++; continue; }
    const ax = a < 0 ? -a : a;
    if (ax > health.maxAbs) health.maxAbs = ax;
    const d = a - prev;
    const dd = d < 0 ? -d : d;
    if (dd > health.maxDelta) health.maxDelta = dd;
    prev = a;
    health.dcSum += a + b;
    health.dcN += 2;
    if (ax < 1e-6) { zeroRun++; if (zeroRun > health.zeroRunMax) health.zeroRunMax = zeroRun; }
    else zeroRun = 0;
  }
  health.framesScanned += n;
  health.chunksScanned++;
  if (health.maxAbs > 1.0001) health.violations++;
  if (health.nanInf > 0) health.violations++;
}
function healthSnapshot() {
  const dc = health.dcN > 0 ? health.dcSum / health.dcN : 0;
  const dcViol = Math.abs(dc) > 0.02 && health.framesScanned > 16384 ? 1 : 0;
  return {
    nanInf: health.nanInf, maxAbs: health.maxAbs, maxDelta: health.maxDelta,
    dcOffset: dc, zeroRunMax: health.zeroRunMax,
    violations: health.violations + dcViol,
    framesScanned: health.framesScanned, chunksScanned: health.chunksScanned,
  };
}

// ── adaptive buffer controller (A7) — deterministic, explainable ──
const controller = {
  netEwmaBps: 0, decodeEwmaFps: 0, targetSec: DEFAULT_TARGET_SEC,
  starvedMs: 0, decisions: [],
};
function logDecision(decision, inputs, reason) {
  controller.decisions.push({ t: Date.now(), decision, inputs: Math.round(inputs), reason: String(reason) });
  if (controller.decisions.length > 60) controller.decisions.shift();
}
function noteNet(bytes, dtMs) {
  if (dtMs <= 4 || bytes <= 0) return;
  const bps = (bytes * 1000) / dtMs;
  controller.netEwmaBps = controller.netEwmaBps ? controller.netEwmaBps * 0.8 + bps * 0.2 : bps;
}
function noteDecode(frames, dtMs) {
  if (dtMs <= 0 || frames <= 0) return;
  const fps = (frames * 1000) / dtMs;
  controller.decodeEwmaFps = controller.decodeEwmaFps ? controller.decodeEwmaFps * 0.8 + fps * 0.2 : fps;
}
/** Queue depth gate for the fetch backpressure (adaptive target, Rust cap). */
function queueFramesGate(dec) {
  const rate = (dec === dec0 && curTrack && curTrack.rate) ? curTrack.rate :
    (dec !== null && ex && ex.mq_dec_started(dec) === 1 ? ex.mq_dec_sample_rate(dec) : 44100);
  return Math.min(RUST_QUEUE_CAP, Math.round(controller.targetSec * rate));
}

// ── SegmentCache (A8) — per-URL LRU byte ranges ──
const segCache = new Map(); // url → {total, ranges: [{start, end, bytes}], at, bytes}
function cacheTotal(url) {
  const e = segCache.get(url);
  return e ? e.total : 0;
}
function cacheFindRun(url, startByte) {
  const e = segCache.get(url);
  if (!e) return null;
  let end = startByte - 1;
  let chunks = [];
  let changed = true;
  while (changed) { // small fixed-point over sorted-ish ranges
    changed = false;
    for (let i = 0; i < e.ranges.length; i++) {
      const r = e.ranges[i];
      if (r.start <= end + 1 && r.end > end) { chunks.push(r); end = r.end; changed = true; }
    }
  }
  if (!chunks.length) return null;
  return { end: end, chunks: chunks };
}
function cacheBytes() {
  let n = 0;
  segCache.forEach(function (e) { n += e.bytes; });
  return n;
}
function cacheTrimEntry(e) {
  // Trim a single oversized entry from its oldest ranges.
  while (e.bytes > CACHE_BUDGET_BYTES && e.ranges.length > 1) {
    const r = e.ranges.shift();
    e.bytes -= (r.end - r.start + 1);
  }
}
function cacheAdd(url, start, chunk) {
  if (!chunk || !chunk.byteLength) return;
  let e = segCache.get(url);
  if (!e) { e = { total: 0, ranges: [], at: 0, bytes: 0 }; segCache.set(url, e); }
  e.at = Date.now();
  const end = start + chunk.byteLength - 1;
  e.ranges.push({ start: start, end: end, bytes: chunk });
  e.bytes += chunk.byteLength;
  while (segCache.size > 1 && cacheBytes() > CACHE_BUDGET_BYTES) {
    let oldestKey = null; let oldestAt = Infinity;
    segCache.forEach(function (v, k) {
      if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    });
    if (oldestKey === null || oldestKey === url) break;
    segCache.delete(oldestKey);
  }
  cacheTrimEntry(e);
}
function cacheNoteTotal(url, total) {
  let e = segCache.get(url);
  if (!e) { e = { total: 0, ranges: [], at: 0, bytes: 0 }; segCache.set(url, e); }
  if (total && (!e.total || total > e.total)) e.total = total;
  e.at = Date.now();
}

// ── message helpers ──
function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}
function postError(stage, detail) {
  post({ type: 'error', stage, message: String(detail && detail.message ? detail.message : detail) });
}
function scratchViews() {
  const base = ex.mq_scratch_ptr(SCRATCH_BYTES);
  return { base: base, popL: base, popR: base + 32768 };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function activeRate() {
  if (curTrack && curTrack.rate) return curTrack.rate;
  if (dec0 !== null && ex && ex.mq_dec_started(dec0) === 1) return ex.mq_dec_sample_rate(dec0);
  return 44100;
}

// ── silence trim helpers (bounded, signal-based) ──
function trimLeading(l, r) {
  const n = Math.min(l.length, r ? r.length : l.length);
  const cap = Math.min(TRIM_LEAD_FRAMES, n);
  let k = 0;
  while (k < cap) {
    const a = l[k] < 0 ? -l[k] : l[k];
    const b = r ? (r[k] < 0 ? -r[k] : r[k]) : a;
    if (a > TRIM_THRESHOLD || b > TRIM_THRESHOLD) break;
    k++;
  }
  if (k <= 0) return { l: l, r: r };
  return { l: l.subarray(k), r: r ? r.subarray(k) : r };
}
function trimTrailing(l, r) {
  const n = Math.min(l.length, r ? r.length : l.length);
  const cap = Math.min(TRIM_TAIL_FRAMES, n);
  let k = 0;
  while (k < cap) {
    const i = n - 1 - k;
    const a = l[i] < 0 ? -l[i] : l[i];
    const b = r ? (r[i] < 0 ? -r[i] : r[i]) : a;
    if (a > TRIM_THRESHOLD || b > TRIM_THRESHOLD) break;
    k++;
  }
  if (k <= 0) return { l: l, r: r };
  return { l: l.subarray(0, n - k), r: r ? r.subarray(0, n - k) : r };
}

function releaseTailHold() {
  if (!tailHold) return;
  const t = trimTrailing(tailHold.l, tailHold.r);
  const frames = t.l.length;
  if (frames > 0) {
    pcmPort.postMessage({ type: 'pcm', gen: pcmGen, rate: activeRate(), frames: frames, ch0: t.l, ch1: t.r }, [t.l.buffer, t.r.buffer]);
    sentTotal += frames;
    chunksSent++;
    if (t.l.length !== tailHold.l.length) {
      logDecision('trim-tail', tailHold.l.length - frames, 'LAME padding region');
    }
  }
  tailHold = null;
}

// ── PCM pump: pop decoded frames → validate/trim → transfer to worklet ──
function pump() {
  if (dec0 === null || dec0 < 0 || !pcmPort || !ex) return;
  try {
    let guard = 0;
    while (guard++ < 64) {
      // Boundary: A's PCM is fully sent and B is decoded → marker + rotate.
      if (pendingBoundary && !boundaryMarked) {
        const nt = next;
        if (!nt || nt.state !== 'ready' || nt.dec === null) {
          // continuation died between switch decision and now → terminal
          pendingBoundary = false;
          finalizeTerminal();
          break;
        }
        if (ex.mq_dec_queued(nt.dec) <= 0) break; // B not decoded yet — wait
        boundaryMarked = true;
        releaseTailHold();
        pcmPort.postMessage({ type: 'trackStart', gen: pcmGen, trackId: nt.trackId, cumSent: sentTotal });
        boundariesSent++;
        // ROTATE: B's decoder becomes the active one; its fetch is active.
        const oldDec = dec0;
        dec0 = nt.dec;
        if (oldDec !== null && oldDec >= 0) { try { ex.mq_dec_drop(oldDec); } catch (e) {} }
        abortCtrl = nt.ctrl || null;
        curTrack = { trackId: nt.trackId, url: nt.url, durationSec: nt.durationSec, rate: nt.rate || curTrack.rate, basePosSec: 0 };
        pushedBytes = 0; poppedFrames = 0; totalBytes = cacheTotal(nt.url);
        infoSent = false; terminalSent = false;
        activeEof = !!nt.inputEof;
        trackStartSent = sentTotal;
        nt.consumed = true; // historical — its fetch end must not post nextReady
        next = null;
        pendingBoundary = false;
        post({ type: 'trackSent', trackId: curTrack.trackId, cumSent: sentTotal });
        logDecision('boundary-rotate', sentTotal, 'gapless continuation committed');
        // loop continues with dec0 = B
      }

      const dec = dec0;
      const queued = ex.mq_dec_queued(dec);
      if (queued <= 0) {
        if (pendingBoundary || (next && next.state === 'fetching')) break; // waiting on continuation
        break;
      }
      const window = grantedTotal - sentTotal;
      if (window <= 0) break;
      const n = Math.min(POP_FRAMES, window, queued);
      const t0 = Date.now();
      const v = scratchViews();
      const got = ex.mq_dec_pop_pcm(dec, v.popL, v.popR, n);
      if (got <= 0) break;
      noteDecode(got, Date.now() - t0);

      const l = new Float32Array(got);
      const r = new Float32Array(got);
      l.set(new Float32Array(mem.buffer, v.popL, got));
      r.set(new Float32Array(mem.buffer, v.popR, got));

      scanChunk(l, r);

      let outL = l; let outR = r;
      // Leading trim only for the FIRST chunk of a continuation track.
      if (boundaryMarked && poppedFrames === 0) {
        const t = trimLeading(l, r);
        outL = t.l; outR = t.r;
        if (outL.length !== l.length) logDecision('trim-lead', l.length - outL.length, 'LAME delay region');
      }

      const frames = outL.length;
      if (frames <= 0) continue;

      // Tail hold: continuation committed + active input EOF + nothing queued
      // behind → hold the final chunk for boundary polish.
      const canHoldTail = next && next.state === 'ready' && activeEof && ex.mq_dec_queued(dec) <= 0 && !pendingBoundary;
      if (canHoldTail) {
        releaseTailHold();
        tailHold = { l: outL, r: outR };
        prepareBoundary();
        break;
      }

      pcmPort.postMessage({ type: 'pcm', gen: pcmGen, rate: activeRate(), frames: frames, ch0: outL, ch1: outR }, [outL.buffer, outR.buffer]);
      sentTotal += frames;
      poppedFrames += frames;
      chunksSent++;
      framesSent += frames;
    }

    // A's PCM fully sent + tail released → prepare the boundary switch.
    if (next && next.state === 'ready' && !pendingBoundary && activeEof &&
        ex.mq_dec_queued(dec0) <= 0 && !tailHold) {
      prepareBoundary();
    }
  } catch (e) {
    postError('pump', e);
  }
}

/** Decide the boundary switch (A drained, B decoded & rate-verified). */
function prepareBoundary() {
  const nt = next;
  if (!nt || nt.state !== 'ready' || !nt.gaplessOk) return;
  if (tailHold) {
    pendingBoundary = true; // marker fires after the tail is released
    return;
  }
  pendingBoundary = true;
}

function finalizeTerminal() {
  if (terminalSent) return;
  terminalSent = true;
  pumpGuardTerminal();
  post({ type: 'fetchDone', pushedBytes: pushedBytes, poppedFrames: poppedFrames, trackId: curTrack ? curTrack.trackId : null });
}
function pumpGuardTerminal() {
  let guard = 0;
  while (guard++ < 512 && dec0 !== null && dec0 >= 0 && ex.mq_dec_queued(dec0) > 0) {
    pump();
    if (ex.mq_dec_queued(dec0) > 0 && grantedTotal - sentTotal <= 0) break;
  }
}

// ── Fetcher: ranged windows with retry/resume ──
async function fetchWithRetry(url, windowStart, isPrefetch) {
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    try {
      const headers = {};
      if (windowStart > 0) headers['Range'] = 'bytes=' + windowStart + '-';
      const resp = await fetch(url, { headers: headers, signal: ctrl.signal, redirect: 'follow' });
      let lastT = Date.now();
      let netBytes = 0;
      const markNet = function (b) {
        netBytes += b;
        const now = Date.now();
        noteNet(b, now - lastT);
        lastT = now;
      };
      return { resp: resp, ctrl: ctrl, markNet: markNet };
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      attempt++;
      if (attempt > 2) { postError('fetch', e); return null; }
      await sleep(300 * attempt); // backoff, then resume from windowStart
    }
  }
}

// ── stream loader: range windows → decoder push (ACTIVE track) ──
async function loadStream(url, startByte, seq) {
  try {
    if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
    fetchStartByte = startByte | 0;
    pushedBytes = 0;
    poppedFrames = 0;
    infoSent = false;
    activeEof = false;
    terminalSent = false;

    let windowStart = startByte | 0;

    for (;;) {
      if (seq !== loadSeq) return;

      // Cache-first: replay contiguous cached bytes without network.
      const run = cacheFindRun(url, windowStart);
      if (run && run.chunks.length) {
        // Headers must be reported on the cache path too — the backend's
        // canSeek() depends on totalBytes (a cached replay was unseekable).
        post({ type: 'headers', totalBytes: cacheTotal(url), supportsRange: true, startByte: windowStart });
        for (let i = 0; i < run.chunks.length; i++) {
          const c = run.chunks[i];
          if (c.start < windowStart) continue; // overlap head — skip
          if (c.start > windowStart) break;    // gap → network
          pushBytes(c.bytes);
          windowStart = c.end + 1;
          pump();
          if (seq !== loadSeq) return;
        }
        const total = cacheTotal(url);
        if (total && windowStart >= total) {
          logDecision('cache-hit-full', windowStart - (startByte | 0), 'segment cache replay');
          finish(seq);
          return;
        }
        logDecision('cache-hit', windowStart - (startByte | 0), 'segment cache replay');
      }

      const fw = await fetchWithRetry(url, windowStart, false);
      if (!fw) { if (seq === loadSeq) postError('fetch', 'unreachable after retries'); return; }
      const resp = fw.resp;
      if (seq !== loadSeq) { try { fw.ctrl.abort(); } catch (e) {} return; }
      if (!fw.ctrl.signal.aborted) abortCtrl = fw.ctrl;

      if (!resp.ok && resp.status !== 206) {
        postError('fetch', 'HTTP ' + resp.status);
        return;
      }
      const cr = resp.headers.get('content-range');
      let rangeEnd = -1;
      if (cr && /\/(\d+)\s*$/.test(cr)) {
        totalBytes = parseInt(cr.match(/\/(\d+)\s*$/)[1], 10);
        const m = cr.match(/^bytes\s+(\d+)-(\d+)\s*\//);
        if (m) rangeEnd = parseInt(m[2], 10);
      } else if (!windowStart) {
        const cl = resp.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
      }
      if (rangeEnd < 0 && resp.status !== 206) {
        rangeEnd = totalBytes ? totalBytes - 1 : -1;
      }
      const supportsRange = resp.status === 206 || (resp.headers.get('accept-ranges') || '').includes('bytes');
      cacheNoteTotal(url, totalBytes);
      post({ type: 'headers', totalBytes: totalBytes, supportsRange: supportsRange, startByte: windowStart });

      const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
      if (!reader) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (seq !== loadSeq) return;
        pushBytes(buf);
        cacheAdd(url, windowStart, buf);
        fw.markNet(buf.byteLength);
        if (buf.byteLength > 0 && rangeEnd < 0) rangeEnd = windowStart + buf.byteLength - 1;
        if (rangeEnd >= 0 && totalBytes && rangeEnd < totalBytes - 1) {
          windowStart = rangeEnd + 1;
          continue;
        }
        finish(seq);
        return;
      }

      let windowDone = false;
      while (!windowDone) {
        if (!playing && ex.mq_dec_started(dec0) === 1) {
          if (seq !== loadSeq) return;
          await sleep(150);
          continue;
        }
        if (ex.mq_dec_started(dec0) === 1 && ex.mq_dec_queued(dec0) >= queueFramesGate(dec0)) {
          if (seq !== loadSeq) return;
          await sleep(150);
          continue;
        }
        const rd = await reader.read();
        const done = rd.done; const value = rd.value;
        if (seq !== loadSeq) { try { reader.cancel(); } catch (e) {} return; }
        if (done) { windowDone = true; break; }
        if (value && value.byteLength) {
          const at = fetchStartByte + pushedBytes;
          pushBytes(value);
          cacheAdd(url, at, value);
          fw.markNet(value.byteLength);
          if (rangeEnd < 0) rangeEnd = at + value.byteLength - 1;
        }
        pump();
      }

      if (rangeEnd >= 0 && totalBytes && rangeEnd < totalBytes - 1) {
        const nxt = rangeEnd + 1;
        if (nxt > windowStart) { windowStart = nxt; continue; }
      }
      break; // true end of entity (or unknown total exhausted)
    }
    finish(seq);
  } catch (e) {
    if (e && (e.name === 'AbortError' || (e.name === 'TypeError' && abortCtrl && abortCtrl.signal.aborted))) return;
    if (seq !== loadSeq) return;
    postError('stream', e);
  }
}

function pushBytes(chunk) {
  let off = 0;
  const len = chunk.byteLength;
  while (off < len) {
    const take = Math.min(PUSH_SLICE, len - off);
    const base = ex.mq_scratch_ptr(SCRATCH_BYTES);
    const view = new Uint8Array(mem.buffer, base, take);
    view.set(chunk.subarray(off, off + take));
    ex.mq_dec_push(dec0, base, take);
    off += take;
    pushedBytes += take;
  }
  if (!infoSent && ex.mq_dec_started(dec0) === 1) {
    infoSent = true;
    curTrack.rate = ex.mq_dec_sample_rate(dec0);
    post({
      type: 'info',
      sampleRate: curTrack.rate,
      channels: ex.mq_dec_channels(dec0),
      totalBytes: totalBytes,
      abiVersion: ex.mq_abi_version(),
      trackId: curTrack.trackId,
    });
  }
}

function pushTo(dec, chunk) {
  let off = 0;
  while (off < chunk.byteLength) {
    const take = Math.min(PUSH_SLICE, chunk.byteLength - off);
    const base = ex.mq_scratch_ptr(SCRATCH_BYTES);
    const view = new Uint8Array(mem.buffer, base, take);
    view.set(chunk.subarray(off, off + take));
    ex.mq_dec_push(dec, base, take);
    off += take;
  }
}

/**
 * Track fetch finished. If a gapless continuation is committed, the chain
 * continues (no terminal fetchDone — the ring must not get EOF); otherwise
 * drain + terminal.
 */
function finish(seq) {
  if (seq !== loadSeq || dec0 === null) return;
  try { ex.mq_dec_eof(dec0); } catch (e) {}
  activeEof = true;
  const nt = next;
  if (nt && (nt.state === 'ready' || nt.state === 'fetching' || nt.state === 'registered') && !terminalSent) {
    // Continuation in flight or ready — the boundary logic (pump/tick) will
    // either rotate (gapless) or finalize terminal if it falls through.
    post({ type: 'stageDone', trackId: curTrack ? curTrack.trackId : null });
    pump();
    return;
  }
  finalizeTerminal();
}

// ── continuation / prefetch controller (A5 + A10) ──
async function prefetchNext() {
  const nt = next;
  if (!nt || nt.state !== 'registered') return;
  nt.state = 'fetching';
  try {
    if (nt.dec !== null && nt.dec !== undefined) { try { ex.mq_dec_drop(nt.dec); } catch (e) {} }
    const d = ex.mq_dec_new();
    if (d < 0) { nt.state = 'failed'; post({ type: 'nextFailed', trackId: nt.trackId, reason: 'no decoder slot' }); maybeTerminalAfterNext(); return; }
    nt.dec = d;

    // Preload from the segment cache, then network.
    let pos = 0;
    const run = cacheFindRun(nt.url, 0);
    if (run) {
      for (let i = 0; i < run.chunks.length; i++) {
        const c = run.chunks[i];
        if (c.start !== pos) break;
        pushTo(nt.dec, c.bytes);
        pos = c.end + 1;
        if (ex.mq_dec_queued(nt.dec) >= queueFramesGate(nt.dec)) break;
      }
    }
    const total = cacheTotal(nt.url);
    if (total && pos >= total) {
      nt.inputEof = true;
      try { ex.mq_dec_eof(nt.dec); } catch (e) {}
      markNextReady(nt);
      return;
    }

    const fw = await fetchWithRetry(nt.url, pos, true);
    if (!fw || !fw.resp) {
      nt.state = 'failed';
      post({ type: 'nextFailed', trackId: nt.trackId, reason: 'fetch failed' });
      maybeTerminalAfterNext();
      return;
    }
    nt.ctrl = fw.ctrl;
    const resp = fw.resp;
    if (!resp.ok && resp.status !== 206) {
      nt.state = 'failed';
      post({ type: 'nextFailed', trackId: nt.trackId, reason: 'HTTP ' + resp.status });
      maybeTerminalAfterNext();
      return;
    }
    const cr = resp.headers.get('content-range');
    if (cr && /\/(\d+)\s*$/.test(cr)) cacheNoteTotal(nt.url, parseInt(cr.match(/\/(\d+)\s*$/)[1], 10));
    const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
    if (!reader) {
      const buf = new Uint8Array(await resp.arrayBuffer());
      pushTo(nt.dec, buf);
      cacheAdd(nt.url, pos, buf);
      nt.inputEof = true;
      try { ex.mq_dec_eof(nt.dec); } catch (e) {}
      markNextReady(nt);
      return;
    }
    for (;;) {
      if (nt.state === 'aborted') { try { reader.cancel(); } catch (e) {} return; }
      if (ex.mq_dec_queued(nt.dec) >= queueFramesGate(nt.dec)) { await sleep(200); continue; }
      const rd = await reader.read();
      const done = rd.done; const value = rd.value;
      if (done) break;
      if (value && value.byteLength) {
        pushTo(nt.dec, value);
        cacheAdd(nt.url, pos, value);
        fw.markNet(value.byteLength);
        pos += value.byteLength;
      }
    }
    nt.inputEof = true;
    // Post-rotation: nt.dec IS the active decoder — marking its input EOF is
    // correct (B's bytes are all pushed); flag terminal eligibility.
    if (nt.dec === dec0) {
      activeEof = true;
      tick();
      return;
    }
    markNextReady(nt);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    nt.state = 'failed';
    post({ type: 'nextFailed', trackId: nt.trackId, reason: String(e && e.message ? e.message : e) });
    maybeTerminalAfterNext();
  }
}

/** Continuation fell through while the active stream waits → terminal. */
function maybeTerminalAfterNext() {
  if (activeEof && !pendingBoundary && !terminalSent && dec0 !== null) {
    finalizeTerminal();
  }
}

function markNextReady(nt) {
  if (nt.state === 'aborted' || nt.consumed) return;
  if (next !== nt && nt.dec !== dec0) return; // superseded
  nt.state = 'ready';
  if (!nt.rate && ex.mq_dec_started(nt.dec) === 1) nt.rate = ex.mq_dec_sample_rate(nt.dec);
  if (!nt.channels && ex.mq_dec_started(nt.dec) === 1) nt.channels = ex.mq_dec_channels(nt.dec);
  nt.queued = ex.mq_dec_queued(nt.dec);
  // Gapless is possible ONLY when the continuation decodes at the ACTIVE
  // stream's rate (AudioContext identity) and actually has decoded audio.
  const rateOk = !!nt.rate && nt.rate === activeRate();
  const hasAudio = nt.queued > 0;
  nt.gaplessOk = rateOk && hasAudio;
  if (nt.gaplessOk) {
    post({ type: 'nextReady', trackId: nt.trackId, sampleRate: nt.rate, channels: nt.channels, queuedFrames: nt.queued, gapless: true });
    pump(); // may immediately prepare the boundary if A already drained
  } else {
    post({ type: 'nextReady', trackId: nt.trackId, sampleRate: nt.rate || 0, channels: nt.channels || 0, queuedFrames: nt.queued || 0, gapless: false, reason: !nt.rate ? 'no stream info' : (!rateOk ? 'sample-rate mismatch' : 'no decoded head') });
    abortNext(nt, 'gapless-unsupported');
    maybeTerminalAfterNext();
  }
}

function abortNext(nt, reason) {
  if (!nt) return;
  nt.state = 'aborted';
  if (nt.ctrl) { try { nt.ctrl.abort(); } catch (e) {} nt.ctrl = null; }
  if (nt.dec !== null && nt.dec !== undefined && nt.dec !== dec0) {
    try { ex.mq_dec_drop(nt.dec); } catch (e) {}
    nt.dec = null;
  }
  // The global slot only clears when THIS object still occupies it (the
  // rotation path clears it first — then nt is historical, not active).
  if (next === nt) next = null;
  if (reason) post({ type: 'nextCleared', trackId: nt.trackId, reason: reason });
}

// ── worker tick: pump, prefetch scheduling, stall accounting ──
function tick() {
  if (!ex || dec0 === null || dec0 < 0) return;
  try {
    pump();

    // Prefetch scheduling by continuation lead (A10).
    if (next && next.state === 'registered' && curTrack && curTrack.rate) {
      const rate = curTrack.rate;
      // ABSOLUTE played position: seek offset (basePosSec) + frames sent
      // since the flush. Without basePosSec a mid-track seek resets the
      // counter to ~0 → remaining ≈ full duration → prefetch never fires.
      const playedSec = (curTrack.basePosSec || 0) + (sentTotal - trackStartSent) / rate;
      const remaining = (curTrack.durationSec || 0) - playedSec;
      if (remaining <= next.leadSec) {
        logDecision('prefetch-start', remaining, 'lead ' + next.leadSec.toFixed(1) + 's remaining');
        prefetchNext();
      }
    }
    // nextReady escalation once the head is decoded (before fetch completes).
    if (next && next.state === 'fetching' && next.dec !== null && next.dec !== undefined &&
        ex.mq_dec_started(next.dec) === 1 && !next.readySent) {
      const q = ex.mq_dec_queued(next.dec);
      const r = ex.mq_dec_sample_rate(next.dec);
      if (q >= Math.round(NEXT_READY_MIN_SEC * r) || next.inputEof) {
        next.readySent = true;
        markNextReady(next);
      }
    }

    // Terminal check: active input EOF, no continuation, not yet terminal.
    if (activeEof && !pendingBoundary && !terminalSent && dec0 !== null) {
      const drainedHere = ex.mq_dec_queued(dec0) <= 0 && !tailHold;
      if (!next) {
        if (drainedHere) finalizeTerminal();
      } else if (next.state !== 'ready' && drainedHere) {
        // SAFETY NET: continuation registered but stuck (registered/fetching)
        // while the active track is fully drained — the prefetch will not
        // make the boundary in time. Bounded wait, then fall back to a
        // NORMAL track end (store auto-advance reloads the next track).
        // A stuck continuation must NEVER hang playback in silence.
        drainedWaitMs += TICK_MS;
        if (drainedWaitMs >= 2500) {
          logDecision('continuation-giveup', drainedWaitMs, 'next stuck in ' + next.state + ' after drain');
          clearNext('give-up');
        }
      } else {
        drainedWaitMs = 0;
      }
    } else {
      drainedWaitMs = 0;
    }

    // Stall accounting → adaptive target raise (A7).
    const queueEmpty = ex.mq_dec_queued(dec0) <= 0 && !tailHold;
    if (playing && queueEmpty && !activeEof) {
      controller.starvedMs += TICK_MS;
      if (controller.starvedMs >= 400 && controller.targetSec < MAX_TARGET_SEC) {
        controller.targetSec = Math.min(MAX_TARGET_SEC, controller.targetSec + 1);
        logDecision('target-raise', controller.targetSec, 'stall ' + controller.starvedMs + 'ms → deeper buffer');
        controller.starvedMs = 0;
      }
    } else if (controller.starvedMs > 0 && !queueEmpty) {
      controller.starvedMs = 0;
    }
  } catch (e) { /* tick is best-effort */ }
}

// ── PCM port (credit plane from the worklet) ──
function bindPcmPort(port) {
  pcmPort = port;
  if (pcmPort) {
    pcmPort.onmessage = (e) => {
      if (e.data && e.data.type === 'credit') {
        if (typeof e.data.gen === 'number' && (e.data.gen | 0) !== pcmGen) return;
        creditsIn++;
        const total = e.data.total | 0;
        if (total > grantedTotal) grantedTotal = total;
        pump();
      }
    };
  }
  pump();
}

// ── generation resets (atomic with the worklet's flush) ──
function resetForGen() {
  grantedTotal = 0;
  sentTotal = 0;
  trackStartSent = 0;
  pendingBoundary = false;
  boundaryMarked = false;
  tailHold = null;
  terminalSent = false;
  resetHealth();
}

function clearNext(reason) {
  const nt = next;
  next = null;
  if (nt) {
    abortNext(nt, reason || 'cleared');
    maybeTerminalAfterNext();
  }
}

// ── message pump (main thread control) ──
self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  try {
    switch (msg.type) {
      case 'init': {
        const instance = await WebAssembly.instantiate(msg.codecModule, {});
        ex = instance.exports;
        mem = ex.memory;
        bindPcmPort(msg.pcmPort || null);
        const abi = ex.mq_abi_version();
        if (msg.expectedAbi !== undefined && abi !== msg.expectedAbi) {
          post({ type: 'abi-mismatch', got: abi, expected: msg.expectedAbi });
          return;
        }
        dec0 = ex.mq_dec_new();
        if (dec0 < 0) { postError('dec-new', 'no decoder slot'); return; }
        post({ type: 'ready', abiVersion: abi, version: ex.mq_version() });
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(tick, TICK_MS);
        break;
      }
      case 'bindPort': {
        bindPcmPort(msg.pcmPort);
        break;
      }
      case 'load': {
        loadSeq++;
        pcmGen = msg.gen | 0;
        pendingSeek = null;
        if (seekCoalesceTimer) { clearTimeout(seekCoalesceTimer); seekCoalesceTimer = null; }
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        clearNext();
        resetForGen();
        activeEof = false;
        drainedWaitMs = 0;
        if (dec0 !== null && dec0 >= 0) ex.mq_dec_reset(dec0);
        curTrack = { trackId: msg.trackId, url: msg.url, durationSec: +msg.durationSec || 0, rate: 0, basePosSec: 0 };
        playing = !!msg.autoplay;
        await loadStream(msg.url, 0, loadSeq);
        break;
      }
      case 'seek': {
        loadSeq++;
        pcmGen = msg.gen | 0;
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        clearNext();
        resetForGen();
        activeEof = false;
        drainedWaitMs = 0;
        // Absolute position anchor: after the flush, sentTotal restarts at
        // 0, so the prefetch scheduler's "remaining" MUST add the seek
        // offset — otherwise a mid-track seek makes the engine think the
        // whole track is still ahead (prefetch never fires → terminal
        // blocked → STARVED hang at track end).
        if (curTrack) curTrack.basePosSec = +msg.posSec || 0;
        if (dec0 !== null && dec0 >= 0) ex.mq_dec_reset(dec0);
        // Coalesce rapid scrubbing: defer the refetch 150 ms; a newer seek
        // supersedes this one — one network round trip per gesture.
        pendingSeek = { url: msg.url, byte: msg.byte | 0 };
        if (seekCoalesceTimer) clearTimeout(seekCoalesceTimer);
        const seq = loadSeq;
        seekCoalesceTimer = setTimeout(() => {
          seekCoalesceTimer = null;
          const ps = pendingSeek;
          pendingSeek = null;
          if (!ps || seq !== loadSeq) return;
          loadStream(ps.url, ps.byte, seq);
        }, SEEK_COALESCE_MS);
        break;
      }
      case 'next': {
        if (!msg.trackId || !msg.url) return;
        if (next && next.trackId === msg.trackId &&
            (next.state === 'registered' || next.state === 'fetching' || next.state === 'ready')) return; // idempotent
        clearNext('superseded');
        next = {
          trackId: msg.trackId, url: msg.url, durationSec: +msg.durationSec || 0,
          leadSec: Math.max(2, +msg.leadSec || 12), state: 'registered',
          rate: 0, channels: 0, queued: 0, dec: null, ctrl: null,
          inputEof: false, readySent: false, gaplessOk: false,
        };
        break;
      }
      case 'cancelNext': {
        clearNext('cancelled');
        break;
      }
      case 'play': {
        playing = true;
        pump();
        break;
      }
      case 'pause': {
        playing = false;
        break;
      }
      case 'abort': {
        loadSeq++;
        pendingSeek = null;
        if (seekCoalesceTimer) { clearTimeout(seekCoalesceTimer); seekCoalesceTimer = null; }
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        clearNext();
        if (dec0 !== null && dec0 >= 0) ex.mq_dec_reset(dec0);
        activeEof = false;
        break;
      }
      case 'destroy': {
        loadSeq++;
        pendingSeek = null;
        if (seekCoalesceTimer) { clearTimeout(seekCoalesceTimer); seekCoalesceTimer = null; }
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        clearNext();
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (dec0 !== null && dec0 >= 0) { try { ex.mq_dec_drop(dec0); } catch (e) {} }
        dec0 = null;
        if (pcmPort) { try { pcmPort.close(); } catch (e) {} }
        break;
      }
    }
  } catch (e) {
    postError('worker-message', e);
  }
};

// ── flow diagnostics broadcast (1 Hz) ──
setInterval(() => {
  if (!ex || dec0 === null || dec0 < 0) return;
  try {
    post({
      type: 'flow',
      creditsIn: creditsIn, chunksSent: chunksSent, framesSent: framesSent, boundariesSent: boundariesSent,
      queued: ex.mq_dec_queued(dec0),
      nextQueued: next && next.dec !== null && next.dec !== undefined ? ex.mq_dec_queued(next.dec) : 0,
      granted: grantedTotal, sent: sentTotal, playing: playing,
      pushedBytes: pushedBytes, poppedFrames: poppedFrames, pcmGen: pcmGen,
      gapless: !!(next && next.gaplessOk), pendingBoundary: pendingBoundary,
      curTrackId: curTrack ? curTrack.trackId : null,
      nextTrackId: next ? next.trackId : null, nextState: next ? next.state : null,
      activeEof: activeEof, terminalSent: terminalSent,
      health: healthSnapshot(),
      controller: {
        netEwmaBps: Math.round(controller.netEwmaBps),
        decodeEwmaFps: Math.round(controller.decodeEwmaFps),
        targetSec: controller.targetSec,
        starvedMs: controller.starvedMs,
        decisions: controller.decisions.slice(-12),
      },
      cacheBytes: cacheBytes(),
    });
  } catch (e) {}
}, 1000);
