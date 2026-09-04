/**
 * MQ Audio Engine — Decode Worker (non-realtime).
 *
 * Fetches the compressed stream (HTTP Range), pushes bytes into the Rust
 * Symphonia decoder (codec_wasm), pops planar PCM and transfers it to the
 * AudioWorklet over a direct MessagePort (zero main-thread hops).
 *
 * Flow control: the worklet grants "credit" (ring frames free); this worker
 * never sends more PCM than credited, and pauses network reads while the
 * player is paused — so wasm memory never grows unbounded.
 *
 * Plain ES2019, DedicatedWorkerGlobalScope, no bundler.
 */
/* eslint-disable */

const SCRATCH_BYTES = 65536;   // shared push/pop marshalling region
const PUSH_SLICE = 32768;      // max bytes per mq_dec_push call
const POP_FRAMES = 8192;       // max frames per mq_dec_pop_pcm call
const MIN_POP_CREDIT = 2048;   // don't send tiny chunks — wait for real room
const QUEUE_FRAMES_CAP = 1 << 18; // mirrors Rust decode_available() cap

let dec = null;      // decoder handle
let ex = null;       // wasm exports
let mem = null;      // wasm memory
let pcmPort = null;  // MessagePort → AudioWorklet
// Flow control — cumulative sliding window (Phase F §C):
//   grantedTotal: cumulative send allowance from the worklet (sequence
//                 space — a bigger number always widens the window)
//   sentTotal:    cumulative frames sent
// The worker may send while sentTotal < grantedTotal. Cumulative totals
// can never be "abandoned" by a newer grant (that leak deadlocked the
// old replaceable-credit protocol). Invariant on the worklet side:
// ring buffered + (granted − arrived) ≤ ring capacity.
let grantedTotal = 0;
let sentTotal = 0;
let playing = false;
let abortCtrl = null;
let loadSeq = 0;     // generation guard for async loads
// Seek-race guard (Phase F §A): generation stamped on every PCM message.
// The worklet drops frames whose generation ≠ its expected one, so stale
// in-flight chunks can never be written into a freshly flushed ring.
let pcmGen = 0;
let pushedBytes = 0;
let poppedFrames = 0;
let fetchStartByte = 0;
let totalBytes = 0;
let durationSec = 0;

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function postError(stage, detail) {
  post({ type: 'error', stage, message: String(detail && detail.message ? detail.message : detail) });
}

function scratchViews() {
  // Re-acquire after any allocation-producing Rust call (Vec growth moves
  // the buffer — old pointers/views would go stale).
  const base = ex.mq_scratch_ptr(SCRATCH_BYTES);
  return { base, popL: base, popR: base + 32768 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PCM pump: pop decoded frames → transfer to the worklet ──
function pump() {
  // NOTE: `dec === 0` is a VALID handle (first slot) — never use truthiness.
  if (dec === null || dec < 0 || !pcmPort || !ex) return;
  try {
    let guard = 0;
    while (guard++ < 64) {
      const queued = ex.mq_dec_queued(dec);
      if (queued <= 0) break;
      const window = grantedTotal - sentTotal;
      if (window <= 0) break; // no allowance yet — the worklet will widen it
      const n = Math.min(POP_FRAMES, window, queued);
      const v = scratchViews();
      const got = ex.mq_dec_pop_pcm(dec, v.popL, v.popR, n);
      if (got <= 0) break;
      // Copy out of wasm memory into owned buffers (transferred to the worklet)
      const l = new Float32Array(got);
      const r = new Float32Array(got);
      l.set(new Float32Array(mem.buffer, v.popL, got));
      r.set(new Float32Array(mem.buffer, v.popR, got));
      pcmPort.postMessage({ type: 'pcm', gen: pcmGen, frames: got, ch0: l, ch1: r }, [l.buffer, r.buffer]);
      sentTotal += got;
      poppedFrames += got;
      chunksSent++;
      framesSent += got;
    }
  } catch (e) {
    postError('pump', e);
  }
}
let pumpDebugEntries = 0;

// ── stream loader with backpressure ──
async function loadStream(url, startByte, seq) {
  try {
    if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
    abortCtrl = new AbortController();
    fetchStartByte = startByte | 0;
    pushedBytes = 0;
    poppedFrames = 0;
    infoSent = false;

    const headers = {};
    if (startByte > 0) headers['Range'] = 'bytes=' + startByte + '-';
    const resp = await fetch(url, { headers, signal: abortCtrl.signal, redirect: 'follow' });
    if (seq !== loadSeq) return;

    if (!resp.ok && resp.status !== 206) {
      postError('fetch', 'HTTP ' + resp.status);
      return;
    }
    // Full entity size: Content-Range total or Content-Length.
    const cr = resp.headers.get('content-range');
    if (cr && /\/(\d+)\s*$/.test(cr)) {
      totalBytes = parseInt(cr.match(/\/(\d+)\s*$/)[1], 10);
    } else if (!startByte) {
      const cl = resp.headers.get('content-length');
      if (cl) totalBytes = parseInt(cl, 10);
    }
    const supportsRange = resp.status === 206 || (resp.headers.get('accept-ranges') || '').includes('bytes');
    post({ type: 'headers', totalBytes, supportsRange, startByte });

    const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
    if (!reader) {
      // No streaming body — read the whole buffer at once.
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (seq !== loadSeq) return;
      pushBytes(buf);
      finish(seq);
      return;
    }

    for (;;) {
      // Backpressure 1: while paused, stop pulling the network.
      if (!playing && ex.mq_dec_started(dec) === 1) {
        if (seq !== loadSeq) return;
        await sleep(150);
        continue;
      }
      // Backpressure 2: decoded queue saturated (no consumer yet / slow) —
      // stop pulling so the shared byte buffer stays bounded.
      if (ex.mq_dec_started(dec) === 1 && ex.mq_dec_queued(dec) >= QUEUE_FRAMES_CAP) {
        if (seq !== loadSeq) return;
        await sleep(150);
        continue;
      }
      const { done, value } = await reader.read();
      if (seq !== loadSeq) { try { reader.cancel(); } catch (e) {} return; }
      if (done) break;
      if (value && value.byteLength) pushBytes(value);
      pump();
    }
    finish(seq);
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.name === 'TypeError' && abortCtrl && abortCtrl.signal.aborted)) return;
    if (seq !== loadSeq) return;
    postError('stream', e);
  }
}

let infoSent = false;
// Flow diagnostics (§35.18 debug)
let creditsIn = 0;
let chunksSent = 0;
let framesSent = 0;

function pushBytes(chunk) {
  let off = 0;
  const len = chunk.byteLength;
  while (off < len) {
    const take = Math.min(PUSH_SLICE, len - off);
    const base = ex.mq_scratch_ptr(SCRATCH_BYTES);
    const view = new Uint8Array(mem.buffer, base, take);
    view.set(chunk.subarray(off, off + take));
    ex.mq_dec_push(dec, base, take);
    off += take;
    pushedBytes += take;
  }
  if (!infoSent && ex.mq_dec_started(dec) === 1) {
    infoSent = true;
    post({
      type: 'info',
      sampleRate: ex.mq_dec_sample_rate(dec),
      channels: ex.mq_dec_channels(dec),
      totalBytes,
      abiVersion: ex.mq_abi_version(),
    });
  }
}

function finish(seq) {
  if (seq !== loadSeq || dec === null) return;
  try { ex.mq_dec_eof(dec); } catch (e) {}
  pump();
  // Drain the queue completely (EOF is set; the worklet detects the end).
  let guard = 0;
  while (guard++ < 512 && ex.mq_dec_queued(dec) > 0) {
    pump();
    if (ex.mq_dec_queued(dec) > 0 && grantedTotal - sentTotal <= 0) break; // worklet still consuming
  }
  post({ type: 'fetchDone', pushedBytes, poppedFrames });
}

function bindPcmPort(port) {
  pcmPort = port;
  if (pcmPort) {
    pcmPort.onmessage = (e) => {
      if (e.data && e.data.type === 'credit') {
        // Only credits for the CURRENT generation widen the window: a
        // pre-seek credit arriving late must not resurrect the old window.
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

// ── message pump (main thread control + worklet credit) ──
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
        dec = ex.mq_dec_new();
        if (dec < 0) { postError('dec-new', 'no decoder slot'); return; }
        post({ type: 'ready', abiVersion: abi, version: ex.mq_version() });
        break;
      }
      case 'bindPort': {
        bindPcmPort(msg.pcmPort);
        break;
      }
      case 'load': {
        loadSeq++;
        pcmGen = msg.gen | 0;
        durationSec = +msg.durationSec || 0;
        if (dec !== null) ex.mq_dec_reset(dec);
        playing = !!msg.autoplay;
        grantedTotal = 0;
        sentTotal = 0;
        await loadStream(msg.url, msg.startByte | 0, loadSeq);
        break;
      }
      case 'seek': {
        loadSeq++;
        pcmGen = msg.gen | 0;
        if (dec !== null) ex.mq_dec_reset(dec);
        grantedTotal = 0;
        sentTotal = 0;
        // keep current `playing` — the engine keeps its state across seeks
        await loadStream(msg.url, msg.byte | 0, loadSeq);
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
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        if (dec !== null) ex.mq_dec_reset(dec);
        break;
      }
      case 'destroy': {
        loadSeq++;
        if (abortCtrl) { try { abortCtrl.abort(); } catch (e) {} }
        try { if (dec !== null && dec >= 0) ex.mq_dec_drop(dec); } catch (e) {}
        dec = null;
        if (pcmPort) { try { pcmPort.close(); } catch (e) {} }
        break;
      }
    }
  } catch (e) {
    postError('worker-message', e);
  }
};

// Flow diagnostics broadcast (§35.18 debug)
setInterval(() => {
  if (!ex || dec === null || dec < 0) return;
  try {
    post({
      type: 'flow',
      creditsIn, chunksSent, framesSent,
      queued: ex.mq_dec_queued(dec),
      granted: grantedTotal, sent: sentTotal, playing, pushedBytes, poppedFrames, pcmGen,
    });
  } catch (e) {}
}, 1000);
