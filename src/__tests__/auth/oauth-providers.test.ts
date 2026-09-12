/**
 * @vitest-environment node
 */

/**
 * Tests for the OAuth auth layer (v70):
 *   - Telegram Login Widget hash verification (official algorithm)
 *   - Google OAuth state (CSRF) helpers
 *   - Pending-identity tokens (verified provider data → registration step)
 *   - Username derivation for provider-created accounts
 *
 * Node environment: jose + node:crypto need the real Node runtime.
 */
import { describe, it, expect, vi } from "vitest";
import { createHash, createHmac } from "crypto";

// Env vars are read at module load (TELEGRAM_BOT_TOKEN in telegram.ts,
// JWT_SECRET in oauth.ts) — vi.hoisted runs BEFORE the static imports below.
vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-BOT-TOKEN-abcdef";
  process.env.JWT_SECRET = "test-secret-key-for-oauth-tests-32ch!";
});

import { verifyTelegramLoginHash } from "@/lib/telegram";
import {
  verifyOAuthState,
  signPendingIdentity,
  verifyPendingIdentity,
  sanitizeUsernameBase,
  deriveUniqueUsername,
  generateRandomPassword,
} from "@/lib/oauth";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;

/** Build a VALID widget payload the way Telegram does (official algorithm). */
function buildWidgetPayload(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {
    id: "987654321",
    first_name: "Ivan",
    last_name: "Petrov",
    username: "ivan_petrov",
    photo_url: "https://t.me/i/userpic/320/ivan.jpg",
    auth_date: String(Math.floor(Date.now() / 1000) - 30), // 30s ago — fresh
    ...overrides,
  };
  const checkString = Object.keys(base)
    .sort()
    .map((k) => `${k}=${base[k]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(checkString).digest("hex");
  return { ...base, hash };
}

// ── Telegram Login Widget hash verification ─────────────────────────────────

describe("verifyTelegramLoginHash", () => {
  it("accepts a correctly signed payload", () => {
    const params = buildWidgetPayload();
    const result = verifyTelegramLoginHash(params);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("987654321");
    expect(result!.username).toBe("ivan_petrov");
    expect(result!.first_name).toBe("Ivan");
  });

  it("rejects a tampered field (email injection attempt)", () => {
    const params = buildWidgetPayload();
    params.username = "attacker"; // changed AFTER hashing
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("rejects a missing hash", () => {
    const params = buildWidgetPayload();
    delete params.hash;
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("rejects a missing id", () => {
    const params = buildWidgetPayload();
    delete params.id;
    // recompute hash without id — still invalid because id is required
    const checkString = Object.keys(params)
      .filter((k) => k !== "hash")
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("\n");
    const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
    params.hash = createHmac("sha256", secretKey).update(checkString).digest("hex");
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("rejects a stale authorization (replay protection)", () => {
    const params = buildWidgetPayload({ auth_date: String(Math.floor(Date.now() / 1000) - 7200) });
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("rejects a future-dated authorization (clock skew abuse)", () => {
    const params = buildWidgetPayload({ auth_date: String(Math.floor(Date.now() / 1000) + 3600) });
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("rejects a hash signed with the WRONG bot token", () => {
    const params: Record<string, string> = {
      id: "111",
      auth_date: String(Math.floor(Date.now() / 1000)),
    };
    const checkString = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("\n");
    const wrongSecret = createHash("sha256").update("999999:WRONG-TOKEN").digest();
    params.hash = createHmac("sha256", wrongSecret).update(checkString).digest("hex");
    expect(verifyTelegramLoginHash(params)).toBeNull();
  });

  it("verifies a minimal payload (id + auth_date only)", () => {
    const params: Record<string, string> = {
      id: "42",
      auth_date: String(Math.floor(Date.now() / 1000)),
    };
    const checkString = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("\n");
    const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
    params.hash = createHmac("sha256", secretKey).update(checkString).digest("hex");
    const result = verifyTelegramLoginHash(params);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("42");
  });
});

// ── OAuth state (CSRF) ───────────────────────────────────────────────────────

describe("verifyOAuthState", () => {
  it("accepts matching state values", () => {
    const state = "a".repeat(64);
    expect(verifyOAuthState(state, state)).toBe(true);
  });

  it("rejects mismatched state values", () => {
    expect(verifyOAuthState("a".repeat(64), "b".repeat(64))).toBe(false);
  });

  it("rejects a missing cookie value", () => {
    expect(verifyOAuthState(undefined, "a".repeat(64))).toBe(false);
  });

  it("rejects a missing query value", () => {
    expect(verifyOAuthState("a".repeat(64), null)).toBe(false);
  });

  it("rejects length-mismatched values", () => {
    expect(verifyOAuthState("abc", "abcd")).toBe(false);
  });
});

// ── Pending identity tokens ──────────────────────────────────────────────────

describe("signPendingIdentity / verifyPendingIdentity", () => {
  it("round-trips a telegram-widget identity", async () => {
    const token = await signPendingIdentity({
      kind: "telegram-widget",
      providerUserId: "987654321",
      username: "ivan",
      firstName: "Ivan",
      lastName: null,
      photoUrl: "https://t.me/i/userpic/320/ivan.jpg",
    });
    const verified = await verifyPendingIdentity(token);
    expect(verified).not.toBeNull();
    expect(verified!.providerUserId).toBe("987654321");
    expect(verified!.username).toBe("ivan");
    expect(verified!.kind).toBe("telegram-widget");
  });

  it("rejects garbage tokens", async () => {
    expect(await verifyPendingIdentity("not.a.jwt")).toBeNull();
    expect(await verifyPendingIdentity("")).toBeNull();
  });

  it("rejects a session JWT used as a pending token (audience isolation)", async () => {
    // Session tokens carry no aud claim — they must NOT pass pending verification
    const { signToken } = await import("@/lib/auth");
    const sessionToken = await signToken({ userId: "u1", username: "x" });
    expect(await verifyPendingIdentity(sessionToken)).toBeNull();
  });
});

// ── Username derivation ──────────────────────────────────────────────────────

describe("sanitizeUsernameBase", () => {
  it("keeps valid bases", () => {
    expect(sanitizeUsernameBase("ivan.petrov")).toBe("ivanpetrov");
    expect(sanitizeUsernameBase("IVAN")).toBe("ivan");
    expect(sanitizeUsernameBase("user_42-x")).toBe("user_42-x");
  });

  it("truncates to 20 chars", () => {
    expect(sanitizeUsernameBase("a".repeat(40))).toHaveLength(20);
  });

  it("rejects empty / too short / reserved", () => {
    expect(sanitizeUsernameBase(null)).toBeNull();
    expect(sanitizeUsernameBase("")).toBeNull();
    expect(sanitizeUsernameBase(".")).toBeNull();
    expect(sanitizeUsernameBase("admin")).toBeNull(); // reserved
    expect(sanitizeUsernameBase("system")).toBeNull();
  });
});

describe("deriveUniqueUsername", () => {
  it("returns the base when free", async () => {
    const name = await deriveUniqueUsername("freename", async () => false);
    expect(name).toBe("freename");
  });

  it("appends a numeric suffix when taken", async () => {
    const taken = new Set(["taken", "taken2", "taken3"]);
    const name = await deriveUniqueUsername("taken", async (c) => taken.has(c));
    expect(name).toBe("taken4");
  });

  it("falls back to a random handle when everything is taken", async () => {
    const name = await deriveUniqueUsername("x", async () => true);
    expect(name).toMatch(/^user_\d{6}$|^user_[0-9a-f]{8}$/);
  });

  it("works with an unusable base", async () => {
    const name = await deriveUniqueUsername("...", async () => false);
    expect(name).toMatch(/^user_\d{6}$|^user_[0-9a-f]{8}$/);
  });
});

describe("generateRandomPassword", () => {
  it("produces long unique hex strings (never plaintext user passwords)", () => {
    const a = generateRandomPassword();
    const b = generateRandomPassword();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
  });
});
