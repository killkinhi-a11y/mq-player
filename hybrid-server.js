/**
 * Hybrid server: lightweight API + Next.js SSR
 *
 * Problem: Next.js standalone server gets killed by the container's OOM
 * during API request processing (VmSize spikes to 10GB).
 *
 * Solution: Use a raw Node.js HTTP server that:
 *  1. Handles /api/* routes directly (no Next.js overhead)
 *  2. Proxies everything else to the Next.js server on a random port
 *     This way, only SSR page loads go through Next.js (which can be
 *     restarted if it crashes), while API calls are ultra-lightweight.
 */

const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const CLIENT_IDS = [
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];
let validatedId = CLIENT_IDS[0];

/* ------------------------------------------------------------------ */
/*  SoundCloud helpers                                                 */
/* ------------------------------------------------------------------ */

function searchSC(query, limit = 30) {
  const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${validatedId}&limit=${limit}&facet=genre`;
  return fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((data) =>
      (data.collection || []).map((t) => {
        const user = t.user || {};
        const artwork = t.artwork_url
          ? t.artwork_url.replace("-large.", "-t500x500.")
          : (user.avatar_url || "").replace("-large.", "-t500x500.");
        const dur = t.full_duration || t.duration || 30000;
        return {
          id: `sc_${t.id}`,
          title: t.title || "Unknown",
          artist: user.username || "Unknown",
          album: "",
          duration: Math.round(dur / 1000),
          cover: artwork || "",
          genre: t.genre || "",
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud",
          scTrackId: t.id,
          scStreamPolicy: t.policy || "",
          scIsFull: t.policy !== "SNIP",
        };
      })
    )
    .catch(() => []);
}

function resolveStream(trackId) {
  const url = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${validatedId}`;
  return fetch(url, { signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .then(async (track) => {
      if (!track) return { url: null, error: "track_not_found" };
      const transcodings = (track.media && track.media.transcodings) || [];
      let streamUrl = null;
      for (const t of transcodings) {
        if (t.format && t.format.protocol === "progressive") {
          streamUrl = t.url;
          break;
        }
      }
      if (!streamUrl && transcodings.length > 0) streamUrl = transcodings[0].url;
      if (!streamUrl) return { url: null, error: "no_transcodings" };
      const sep = streamUrl.includes("?") ? "&" : "?";
      try {
        const r = await fetch(`${streamUrl}${sep}client_id=${validatedId}`, {
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        const d = await r.json();
        if (d.url)
          return {
            url: d.url,
            isPreview: track.policy === "SNIP",
            duration: Math.round((track.duration || 0) / 1000),
          };
      } catch {}
      return {
        url: `${streamUrl}${sep}client_id=${validatedId}`,
        isPreview: track.policy === "SNIP",
      };
    })
    .catch(() => ({ url: null, error: "resolve_failed" }));
}

/* ------------------------------------------------------------------ */
/*  Static file serving                                                 */
/* ------------------------------------------------------------------ */

const MIME = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webp": "image/webp",
};

function serveStatic(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    return {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
      body: data,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Next.js sub-server management                                       */
/* ------------------------------------------------------------------ */

let nextServerPort = 0;
let nextServerProc = null;
let nextServerReady = false;

function findFreePort() {
  const net = require("net");
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

async function startNextServer() {
  const port = await findFreePort();
  nextServerPort = port;
  nextServerReady = false;

  const child = require("child_process").spawn(
    "node",
    ["server.js"],
    {
      cwd: "/home/z/my-project/.next/standalone",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port) },
    }
  );

  child.stdout.on("data", (d) => {
    const msg = d.toString();
    if (msg.includes("Ready")) nextServerReady = true;
  });

  child.on("exit", () => {
    nextServerProc = null;
    nextServerReady = false;
    // Auto-restart after 2s
    setTimeout(startNextServer, 2000);
  });

  child.on("error", () => {
    nextServerProc = null;
    setTimeout(startNextServer, 2000);
  });

  nextServerProc = child;
  console.log(`[hybrid] Next.js sub-server starting on port ${port}`);

  // Wait up to 10s for ready
  for (let i = 0; i < 20; i++) {
    if (nextServerReady) {
      console.log(`[hybrid] Next.js ready on port ${port}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[hybrid] Next.js not ready after 10s, will retry`);
}

function proxyToNext(req, res) {
  if (!nextServerProc || !nextServerReady) {
    // Return loading page while Next.js starts
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mq — Загрузка</title></head><body style="margin:0;background:#0e0e0e;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><div style="font-size:48px;font-weight:800;color:#e03131;margin-bottom:12px">mq</div><div style="color:#888;font-size:14px">Загрузка...</div></div></body></html>`);
    return;
  }

  const options = {
    hostname: "127.0.0.1",
    port: nextServerPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${nextServerPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "text/html" });
    res.end("<h1>502 - Next.js restarting...</h1>");
  });

  req.pipe(proxyReq);
}

/* ------------------------------------------------------------------ */
/*  Prisma API routes (need Next.js runtime)                           */
/* ------------------------------------------------------------------ */

// These routes use Prisma + Next.js internals, so they go through Next.js

/* ------------------------------------------------------------------ */
/*  Main server                                                         */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  try {
    // --- API: SoundCloud Search (lightweight) ---
    if (pathname === "/api/music/search") {
      const q = url.searchParams.get("q");
      const tracks = q ? await searchSC(q) : [];
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300",
      });
      res.end(JSON.stringify({ tracks }));
      return;
    }

    // --- API: Genre Search (lightweight) ---
    if (pathname === "/api/music/genre") {
      const genre = url.searchParams.get("genre");
      const tracks = genre ? await searchSC(genre) : [];
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=600",
      });
      res.end(JSON.stringify({ tracks }));
      return;
    }

    // --- API: Stream Resolution (lightweight) ---
    if (pathname === "/api/music/soundcloud/stream") {
      const trackId = url.searchParams.get("trackId");
      if (!trackId) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: null, error: "missing trackId" }));
        return;
      }
      const result = await resolveStream(trackId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    // --- API: Trending (lightweight) ---
    if (pathname === "/api/music/trending") {
      const tracks = await searchSC("top hits 2025", 30);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tracks }));
      return;
    }

    // --- Static assets: _next/static ---
    if (pathname.startsWith("/_next/static/")) {
      // Try standalone path first, then main .next
      const filePath = path.join(
        "/home/z/my-project/.next/standalone/.next",
        pathname
      );
      const result = serveStatic(filePath);
      if (result) {
        res.writeHead(result.status, result.headers);
        res.end(result.body);
        return;
      }
    }

    // --- Public files ---
    const publicPath = path.join("/home/z/my-project/public", pathname);
    const publicResult = serveStatic(publicPath);
    if (publicResult) {
      res.writeHead(publicResult.status, publicResult.headers);
      res.end(publicResult.body);
      return;
    }

    // --- Everything else: proxy to Next.js ---
    proxyToNext(req, res);
  } catch (err) {
    console.error("[hybrid] Error:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[hybrid] Main server listening on :${PORT}`);
  startNextServer();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  if (nextServerProc) nextServerProc.kill();
  server.close();
  process.exit(0);
});
