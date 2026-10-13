/**
 * CSP regression tests — UI V4.2 (security hotfix).
 *
 * Guards the evidence-based Content-Security-Policy allowlist that unblocks:
 *   - Cloudflare Turnstile (CobaltTurnstile, SNIP-bypass JWT)
 *   - Telegram Login Widget (AuthView + AccountLinkingCard)
 *
 * Root-cause evidence: download/ui-v4.2/csp-evidence/CSP-EVIDENCE.md
 * (4 live securitypolicyviolation events reproduced on production 2026-10-13).
 *
 * Token-precise assertions: 'wasm-unsafe-eval' CONTAINS the substring
 * 'unsafe-eval', so substring checks are forbidden — directives are split
 * into exact tokens first.
 */
import { describe, it, expect } from "vitest";

// Direct import keeps the test honest: it exercises the REAL headers() the
// build ships (not a copy). @sentry/nextjs + @next/bundle-analyzer wrappers
// are side-effect-free at module scope.
import nextConfigModule from "../../../next.config";

const config = nextConfigModule as unknown as {
  headers?: () => Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

/** Split a CSP value into { directive: token[] } (order preserved). */
function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const raw of csp.split(";")) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const [name, ...tokens] = parts;
    out[name] = tokens;
  }
  return out;
}

async function getCspHeader(): Promise<string> {
  const rules = await Promise.resolve(config.headers!());
  const catchAll = rules.find((r) => r.source === "/(.*)");
  const h = catchAll?.headers.find((x) => x.key === "Content-Security-Policy");
  if (!h) throw new Error("Content-Security-Policy not found on catch-all route /(.*)");
  return h.value;
}

async function getRules() {
  return await Promise.resolve(config.headers!());
}

const cspValue: string = await getCspHeader();
const csp = parseCsp(cspValue);

describe("CSP: header present on the catch-all route", () => {
  it("exposes one CSP for /(.*) (all pages incl. login)", () => {
    expect(cspValue.length).toBeGreaterThan(0);
    expect(Object.keys(csp).length).toBeGreaterThanOrEqual(10);
  });
});

describe("CSP: auth widgets unblocked (the V4.2 fix)", () => {
  it("script-src allows the Turnstile api.js origin", () => {
    expect(csp["script-src"]).toContain("https://challenges.cloudflare.com");
  });

  it("script-src allows the Telegram widget + webapp scripts", () => {
    expect(csp["script-src"]).toContain("https://telegram.org");
  });

  it("frame-src exists and allows the Turnstile iframe origin", () => {
    expect(csp["frame-src"]).toBeDefined();
    expect(csp["frame-src"]).toContain("https://challenges.cloudflare.com");
  });

  it("frame-src allows the Telegram login widget iframe origin (oauth.telegram.org)", () => {
    expect(csp["frame-src"]).toContain("https://oauth.telegram.org");
  });

  it("frame-src keeps 'self' (no regression for same-origin embeds)", () => {
    expect(csp["frame-src"]).toContain("'self'");
  });
});

describe("CSP: no dangerous global exceptions (rule: no quick fixes)", () => {
  it("script-src has NO standalone 'unsafe-eval' token (wasm keyword is not a loophole)", () => {
    // Exact-token check: 'wasm-unsafe-eval' must NOT satisfy this assertion.
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("WASM engine still compiles: 'wasm-unsafe-eval' present", () => {
    expect(csp["script-src"]).toContain("'wasm-unsafe-eval'");
  });

  it("no directive contains the wildcard *", () => {
    for (const [name, tokens] of Object.entries(csp)) {
      expect(tokens, `${name} must not contain *`).not.toContain("*");
      // scheme-wildcards like https: are broad — only allowed in the
      // documented resolver-dynamic directives:
      if (tokens.includes("https:")) {
        expect(["img-src", "media-src", "connect-src", "style-src", "font-src"]).toContain(name);
      }
    }
  });

  it("script-src contains no scheme-wildcard", () => {
    expect(csp["script-src"]).not.toContain("https:");
    expect(csp["script-src"]).not.toContain("http:");
  });

  it("frame-src contains no scheme-wildcard", () => {
    expect(csp["frame-src"]).not.toContain("https:");
  });
});

describe("CSP: third-party origins only in the directives that need them", () => {
  const SCRIPT_FRAME_ORIGINS = ["https://challenges.cloudflare.com"];
  const FRAME_ONLY_ORIGINS = ["https://oauth.telegram.org"];
  const SCRIPT_ONLY_ORIGINS = ["https://telegram.org", "https://fonts.googleapis.com"];
  const FONT_ONLY_ORIGINS = ["https://fonts.gstatic.com"];

  it("challenges.cloudflare.com appears ONLY in script-src and frame-src", () => {
    for (const origin of SCRIPT_FRAME_ORIGINS) {
      for (const [name, tokens] of Object.entries(csp)) {
        if (name === "script-src" || name === "frame-src") continue;
        expect(tokens, `${origin} leaked into ${name}`).not.toContain(origin);
      }
    }
  });

  it("oauth.telegram.org appears ONLY in frame-src (iframe-only origin)", () => {
    for (const origin of FRAME_ONLY_ORIGINS) {
      for (const [name, tokens] of Object.entries(csp)) {
        if (name === "frame-src") continue;
        expect(tokens, `${origin} leaked into ${name}`).not.toContain(origin);
      }
    }
  });

  it("telegram.org is not over-scoped into img/media/connect/frame", () => {
    for (const origin of SCRIPT_ONLY_ORIGINS) {
      expect(csp["frame-src"], `${origin} must not be in frame-src`).not.toContain(origin);
      expect(csp["img-src"]).not.toContain(origin);
      expect(csp["media-src"]).not.toContain(origin);
    }
  });

  it("font origins stay out of frame-src", () => {
    for (const origin of [...FONT_ONLY_ORIGINS, "https://fonts.googleapis.com"]) {
      expect(csp["frame-src"]).not.toContain(origin);
    }
  });
});

describe("CSP: protections preserved (nothing deleted to silence errors)", () => {
  it("default-src stays 'self'", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
  });

  it("frame-ancestors 'none' (clickjacking guard)", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("base-uri 'self'", () => {
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });

  it("form-action 'self'", () => {
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("style-src / font-src unchanged (fonts.googleapis.com / fonts.gstatic.com)", () => {
    expect(csp["style-src"]).toContain("'self'");
    expect(csp["style-src"]).toContain("'unsafe-inline'");
    expect(csp["style-src"]).toContain("https://fonts.googleapis.com");
    expect(csp["font-src"]).toContain("'self'");
    expect(csp["font-src"]).toContain("https://fonts.gstatic.com");
  });

  it("img-src keeps data:/blob: (inline artwork + object URLs)", () => {
    expect(csp["img-src"]).toContain("data:");
    expect(csp["img-src"]).toContain("blob:");
  });

  it("media-src keeps blob: (MediaSource streams)", () => {
    expect(csp["media-src"]).toContain("blob:");
  });

  it("connect-src keeps wss: (SSE/websocket social features)", () => {
    expect(csp["connect-src"]).toContain("wss:");
  });
});

describe("CSP: header hygiene on route rules", () => {
  it("security headers are attached to the catch-all route too", async () => {
    const rules = await getRules();
    const catchAll = rules.find((r) => r.source === "/(.*)");
    const keys = catchAll?.headers.map((h) => h.key) ?? [];
    for (const expected of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-XSS-Protection",
      "Permissions-Policy",
    ]) {
      expect(keys, `catch-all route missing ${expected}`).toContain(expected);
    }
  });

  it("X-Frame-Options stays DENY", async () => {
    const rules = await getRules();
    const catchAll = rules.find((r) => r.source === "/(.*)");
    const xfo = catchAll?.headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
  });
});
