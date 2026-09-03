import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Vercel auto-detects Next.js — don't use 'standalone' output on Vercel
// (standalone is for Docker/self-hosted; Vercel has its own build system)
const isVercel = !!process.env.VERCEL;

// ── Phase M: per-commit build identity (read ONCE at config evaluation) ──
// scripts/generate-version.mjs (prebuild) writes .mq-build-id; the SAME value
// goes into: (a) generateBuildId below, (b) NEXT_PUBLIC_MQ_BUILD_ID env —
// inlined into the CLIENT BUNDLE at build time (App Router has no
// window.__NEXT_DATA__.buildId — that's Pages Router only), (c) public/version.json.
// (a)===(c) is what UpdateManager compares to detect new deployments.
const MQ_BUILD_ID = (() => {
  try {
    const id = readFileSync(join(process.cwd(), ".mq-build-id"), "utf8").trim();
    if (id) return id;
  } catch {}
  return null; // dev without prebuild / fresh clone — fall back to legacy id
})();

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  // Baked into the client bundle — the page's own build identity (#20).
  ...(MQ_BUILD_ID ? { env: { NEXT_PUBLIC_MQ_BUILD_ID: MQ_BUILD_ID } } : {}),
  // Single source of truth for build ID. layout.tsx's boot script reads the
  // NEXT_PUBLIC_MQ_BUILD_ID inline value — same id, same build.
  // Bumping this triggers a targeted store-version bump (see useAppStore.ts)
  // instead of the destructive localStorage.clear() we used before.
  generateBuildId: async () => {
    return MQ_BUILD_ID || process.env.BUILD_ID || "mq-build-v58";
  },
  serverExternalPackages: ['@opennextjs/cloudflare'],
  experimental: {
    // Allow uploads up to 200MB (default is 10MB)
    proxyClientMaxBodySize: 200 * 1024 * 1024,
    // react-best-practices rule bundle-barrel-imports (CRITICAL):
    // 44 files import from 'lucide-react' barrel — without this flag, each
    // import loads ~1,583 modules (200-800ms cold start cost). With it,
    // Next.js transforms `import { X } from 'lucide-react'` to direct
    // path imports at build time. 15-70% faster dev boot, 28% faster
    // builds, 40% faster cold starts.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-*",
      "date-fns",
      "framer-motion",
    ],
  },
  // Granular cache headers — static assets get long-lived immutable cache,
  // API routes get no-store, pages get must-revalidate.
  // Security headers applied globally.
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
      {
        key: "Content-Security-Policy",
        value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
      },
    ];

    return [
      // Static assets (JS/CSS bundles, images) — cache 1 year, immutable
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ...securityHeaders,
        ],
      },
      // Demo audio files — cache 1 year, immutable (versioned by filename)
      {
        source: "/demo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Accept-Ranges", value: "bytes" },
        ],
      },
      // Public assets (icons, manifest, sw) — cache 1 day, revalidate hourly
      {
        source: "/public/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
          ...securityHeaders,
        ],
      },
      // API routes — never cache
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          ...securityHeaders,
        ],
      },
      // All other pages — revalidate on each visit
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          ...securityHeaders,
        ],
      },
      // WASM audio engine (LAST — later rules override the catch-all's
      // Cache-Control on next start; on Vercel either immutable or
      // must-revalidate applies, both safe: tagged URLs are content-hashed).
      // WASM audio engine — manifest must never be cached (stale JS↔WASM
      // pairing guard, §35.10); tagged artifacts are content-hashed →
      // immutable. NOTE: /audio-engine/version.json does NOT match the
      // :tag/:file* pattern (single path segment) — no rule overlap.
      {
        source: "/audio-engine/:tag/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ...securityHeaders,
        ],
      },
      {
        source: "/audio-engine/version.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          ...securityHeaders,
        ],
      },
      // Phase M root /version.json — whole-app deployment version metadata
      // (distinct from the WASM asset manifest above). MUST always revalidate
      // (never cached by CDN/browser/SW) or update detection breaks (#38).
      // NOTE: defined AFTER the catch-all so its Cache-Control wins for this path.
      {
        source: "/version.json",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

// Sentry webpack config options — hide source maps in production,
// upload them in CI for stack trace linking
const sentryWebpackOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,

  // Hide source maps from users in production
  // Sentry will still receive source maps during build (uploaded via CI)
  hideSourceMaps: true,
};

// Wrap config with Sentry first, then bundle analyzer
// The outermost wrapper runs last, so we want Sentry as the innermost
const withSentry = withSentryConfig(nextConfig, sentryWebpackOptions);

export default withAnalyzer(withSentry);

// Only init Cloudflare workerd during local dev (not during Vercel/CI builds — workerd needs GLIBC_2.35)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
