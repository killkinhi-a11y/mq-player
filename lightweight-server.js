const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 3000;
const CLIENT_IDS = [
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];
let validatedId = CLIENT_IDS[0];

// Cache HTML shell
const playHTML = fs.readFileSync(
  path.join(__dirname, ".next/standalone/play.html"),
  "utf8"
);
const rootHTML = playHTML; // Same page for /

// Cache for search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function searchSC(query, limit = 30) {
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return Promise.resolve(cached.tracks);
  }

  const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${validatedId}&limit=${limit}&facet=genre`;
  return fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  })
    .then((r) => (r.ok ? r.json() : { collection: [] }))
    .then((data) => {
      const tracks = (data.collection || []).map((t) => {
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
      });
      searchCache.set(cacheKey, { tracks, time: Date.now() });
      return tracks;
    })
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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function serveStatic(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      },
      body: data,
    };
  } catch {
    return null;
  }
}

function jsonResponse(data, status = 200) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(data),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

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
    // ---- Lightweight API routes ----
    if (pathname === "/api/music/search") {
      const q = url.searchParams.get("q");
      const tracks = q ? await searchSC(q) : [];
      return send(res, jsonResponse({ tracks }));
    }
    if (pathname === "/api/music/genre") {
      const genre = url.searchParams.get("genre");
      const tracks = genre ? await searchSC(genre, 30) : [];
      return send(res, jsonResponse({ tracks }));
    }
    if (pathname === "/api/music/soundcloud/stream") {
      const trackId = url.searchParams.get("trackId");
      if (!trackId) return send(res, jsonResponse({ url: null, error: "missing trackId" }));
      const result = await resolveStream(trackId);
      return send(res, jsonResponse(result));
    }
    if (pathname === "/api/music/trending") {
      const tracks = await searchSC("top hits 2025", 30);
      return send(res, jsonResponse({ tracks }));
    }

    // ---- Static _next assets ----
    if (pathname.startsWith("/_next/static/")) {
      const fp = path.join("/home/z/my-project/.next/standalone/.next", pathname);
      const result = serveStatic(fp);
      if (result) return send(res, result);
      // Fallback: try main .next dir
      const fp2 = path.join("/home/z/my-project/.next", pathname);
      const result2 = serveStatic(fp2);
      if (result2) return send(res, result2);
    }

    // ---- Public files ----
    const publicPath = path.join("/home/z/my-project/public", pathname);
    const publicResult = serveStatic(publicPath);
    if (publicResult) return send(res, publicResult);

    // ---- HTML pages ----
    if (pathname === "/" || pathname === "/app" || pathname === "/play") {
      // Redirect / and /app to /play
      if (pathname !== "/play") {
        res.writeHead(307, { Location: "/play", "Cache-Control": "no-cache" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
      });
      res.end(playHTML);
      return;
    }

    // ---- 404 ----
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    console.error("[lw] Error:", pathname, err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  }
});

function send(res, result) {
  res.writeHead(result.status, result.headers);
  res.end(result.body);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[lw] Lightweight server on :${PORT}`);
});

process.on("SIGTERM", () => { server.close(); process.exit(0); });
