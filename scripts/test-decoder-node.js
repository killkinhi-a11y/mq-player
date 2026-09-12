// Standalone decoder ABI test: fetch→push→pop cycle outside the browser.
const fs = require("fs");
(async () => {
  const manifest = JSON.parse(fs.readFileSync("/home/z/my-project/mq-player/public/audio-engine/version.json", "utf8"));
  const bytes = fs.readFileSync(`/home/z/my-project/mq-player/public/audio-engine/${manifest.tag}/codec_wasm.wasm`);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports;
  const mem = ex.memory;
  console.log("abi:", ex.mq_abi_version(), "version:", ex.mq_version());

  const h = ex.mq_dec_new();
  console.log("handle:", h);
  if (h < 0) process.exit(1);

  const mp3 = fs.readFileSync("/home/z/my-project/mq-player/public/demo/song1.mp3");
  const SCRATCH = 65536;
  // push in 32KB slices
  let off = 0;
  const push = (buf) => {
    const base = ex.mq_scratch_ptr(SCRATCH);
    const view = new Uint8Array(mem.buffer, base, buf.length);
    view.set(buf);
    ex.mq_dec_push(h, base, buf.length);
  };
  while (off < mp3.length) {
    const take = Math.min(32768, mp3.length - off);
    push(mp3.subarray(off, off + take));
    off += take;
    if (ex.mq_dec_started(h) === 1) {
      console.log("started after", off, "bytes | rate:", ex.mq_dec_sample_rate(h), "ch:", ex.mq_dec_channels(h));
      break;
    }
  }
  ex.mq_dec_eof(h);
  console.log("started:", ex.mq_dec_started(h), "queued frames:", ex.mq_dec_queued(h));

  // pop like the worker does
  let total = 0, chunks = 0;
  let guard = 0;
  while (guard++ < 200) {
    const queued = ex.mq_dec_queued(h);
    if (queued <= 0) break;
    const n = Math.min(8192, queued);
    const base = ex.mq_scratch_ptr(SCRATCH);
    const got = ex.mq_dec_pop_pcm(h, base, base + 32768, n);
    if (got <= 0) {
      console.log("pop returned", got, "with queued=", queued);
      break;
    }
    const l = new Float32Array(mem.buffer, base, got);
    let peak = 0;
    for (let i = 0; i < got; i++) peak = Math.max(peak, Math.abs(l[i]));
    total += got;
    chunks++;
    if (chunks === 1) console.log("first chunk: frames", got, "peak", peak.toFixed(4));
  }
  console.log("TOTAL popped:", total, "frames in", chunks, "chunks (", (total / 44100).toFixed(2), "s )");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
