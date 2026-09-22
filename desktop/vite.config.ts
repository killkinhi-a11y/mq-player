import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const WEB_SRC = path.join(WEB_ROOT, "src");

// ── Desktop build identity (mirrors src/lib/config.ts contract) ─────────────
// The web client bakes NEXT_PUBLIC_* at Next build time; the desktop client
// bakes the same names at Vite build time. API_BASE points every relative
// fetch at production (the desktop proxy attaches the session cookie).
const DESKTOP_VERSION = "1.0.0";
const DESKTOP_BUILD_ID = process.env.MQ_DESKTOP_BUILD_ID || `desktop-${DESKTOP_VERSION}`;
const API_BASE = process.env.MQ_DESKTOP_API_BASE || "https://mq1.vercel.app";
const Tauri_ORIGIN = "http://tauri.localhost";

/**
 * Dev-only mirror of the Rust localhost proxy (src-tauri/src/proxy.rs):
 * lets the FULL desktop UI (browser-mode) run in a normal browser for QA
 * without Tauri — same cookie semantics against the production backend.
 */
function mqDevProxy() {
  return {
    name: "mq-dev-proxy",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url: string = req.url || "";
        if (url.split("?")[0] === "/version.json") {
          // Desktop identity (same contract as the Tauri fetch patch):
          // keeps the web UpdateBanner silent — desktop updates flow
          // through the Tauri updater, not the web version check.
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ version: DESKTOP_VERSION, buildId: DESKTOP_BUILD_ID, desktop: true }));
          return;
        }
        if (!/^(\/api\/|\/audio-engine\/|\/demo\/)/.test(url.split("?")[0])) return next();
        const target = API_BASE + url;
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const headers: Record<string, string> = {};
          ["content-type", "authorization", "accept", "range", "x-mq-desktop"].forEach((h) => {
            if (req.headers[h]) headers[h] = req.headers[h];
          });
          headers["origin"] = API_BASE;
          headers["referer"] = API_BASE + "/";
          headers["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MQPlayerDesktop/1.0";
          const cookieJarPath = path.join(__dirname, ".dev-cookies.json");
          let cookie = "";
          try { cookie = JSON.parse(fs.readFileSync(cookieJarPath, "utf8"))["session"] || ""; } catch {}
          if (cookie) headers["cookie"] = `session=${cookie}`;
          const acat = await fetch(target, {
            method: req.method,
            headers,
            body: body && body.length ? body : undefined,
          });
          const setCookie = acat.headers.getSetCookie?.() || [];
          if (setCookie.length) {
            try {
              const jar: Record<string, string> = {};
              for (const sc of setCookie) {
                const [pair] = sc.split(";");
                const eq = pair.indexOf("=");
                if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
              }
              fs.writeFileSync(cookieJarPath, JSON.stringify(jar));
            } catch {}
          }
          res.writeHead(acat.status, {
            "content-type": acat.headers.get("content-type") || "application/json",
            ...(acat.headers.get("content-range") ? { "content-range": acat.headers.get("content-range")! } : {}),
            ...(acat.headers.get("accept-ranges") ? { "accept-ranges": acat.headers.get("accept-ranges")! } : {}),
            "access-control-allow-origin": "*",
          });
          if (acat.body) {
            const reader = acat.body.getReader();
            // @ts-ignore node stream
            res.flushHeaders?.();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          }
          res.end();
        } catch (e: any) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "dev-proxy", detail: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), mqDevProxy()],
  clearScreen: false,
  publicDir: path.join(WEB_ROOT, "public"),
  resolve: {
    alias: {
      "@": WEB_SRC,
      "next/dynamic": path.join(__dirname, "src/shims/next-dynamic.tsx"),
      "next/image": path.join(__dirname, "src/shims/next-image.tsx"),
    },
    // The shared ../src tree AND the desktop entry must resolve to the
    // SAME physical react/react-dom (hoisted in the repo root) — npm
    // peer auto-install once created a second copy in desktop/node_modules
    // and broke hooks at runtime.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  define: {
    "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(API_BASE),
    "process.env.NEXT_PUBLIC_MQ_BUILD_ID": JSON.stringify(DESKTOP_BUILD_ID),
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(DESKTOP_VERSION),
    "process.env.NEXT_PUBLIC_VAPID_KEY": JSON.stringify(""),
    "process.env.MQ_DESKTOP_BUILD_ID": JSON.stringify(DESKTOP_BUILD_ID),
    "process.env.MQ_DESKTOP_VERSION": JSON.stringify(DESKTOP_VERSION),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", `${WEB_ROOT}/**`] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome110",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
}));
