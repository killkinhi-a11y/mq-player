/**
 * @vitest-environment node
 *
 * Account linking (W13) — link-mode state machine tests.
 *
 * Pins the SECURITY CONTRACT of "Подключить Google / Telegram" in Settings:
 *   1. link mode requires an authenticated session — never creates one
 *   2. provider identity owned by ANOTHER account → linkError=*_taken,
 *      nothing merged, no session change
 *   3. identity already on the session user → idempotent success
 *   4. clean link → AuthIdentity row created for the SESSION user
 *
 * Tested through the Google callback in link mode (mq_oauth_link cookie)
 * and the Telegram widget callback (?link=1) — the same code the browser
 * hits after the OAuth redirects.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret-key-for-oauth-tests-32ch!";
  process.env.GOOGLE_CLIENT_ID = "test-web-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret-never-in-apk";
  process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-BOT-TOKEN";
});

// ── Mock the OAuth lib: state/cookies REAL, token verification mocked ──
vi.mock("@/lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oauth")>();
  return {
    ...actual,
    isGoogleConfigured: () => true,
    verifyGoogleIdToken: vi.fn(),
    exchangeGoogleCode: vi.fn(),
    signPendingIdentity: vi.fn().mockResolvedValue("pending-token"),
    getRequestOrigin: () => "http://localhost:3000",
  };
});

vi.mock("@/lib/telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telegram")>();
  return {
    ...actual,
    isTelegramConfigured: () => true,
    verifyTelegramLoginHash: vi.fn(),
  };
});

vi.mock("@/lib/desktop-handoff", () => ({
  signDesktopHandoffToken: vi.fn().mockResolvedValue("handoff-token"),
}));

const db = vi.hoisted(() => ({
  findFeatureFlagByKey: vi.fn().mockResolvedValue(null),
  findAuthIdentity: vi.fn(),
  findAuthIdentitiesByUserId: vi.fn().mockResolvedValue([]),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByTelegramChatId: vi.fn().mockResolvedValue(null),
  findUserByUsername: vi.fn().mockResolvedValue(null),
  createUser: vi.fn(),
  createAuthIdentity: vi.fn().mockResolvedValue({}),
  updateUser: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/database", () => ({
  database: db,
  isTurso: vi.fn(() => false),
  getTursoClient: vi.fn(),
  tursoQuery: vi.fn(),
  ensureTursoSchema: vi.fn(),
}));

vi.mock("@/lib/admin-grant", () => ({
  ensureOwnerAdminRole: vi.fn().mockResolvedValue("user"),
}));

import { GET as googleCallbackGET } from "@/app/api/auth/google/callback/route";
import { GET as telegramWidgetCallbackGET } from "@/app/api/auth/telegram-widget/callback/route";
import { GET as linkProvidersGET } from "@/app/api/auth/link/providers/route";
import { verifyGoogleIdToken, exchangeGoogleCode } from "@/lib/oauth";
import { verifyTelegramLoginHash } from "@/lib/telegram";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

const mockedVerifyGoogle = vi.mocked(verifyGoogleIdToken);
const mockedExchange = vi.mocked(exchangeGoogleCode);
const mockedVerifyTelegram = vi.mocked(verifyTelegramLoginHash);

const SESSION_USER = { id: "user-1", username: "alice", email: "a@mq.local", role: "user", blocked: false };
const OTHER_USER = { id: "user-2", username: "bob", email: "b@mq.local", role: "user", blocked: false };

function req(url: string, cookies: string[] = []) {
  const headers = new Headers();
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return new NextRequest(url, { headers });
}

async function sessionCookie(): Promise<string> {
  const token = await signToken({
    userId: SESSION_USER.id,
    username: SESSION_USER.username,
    email: SESSION_USER.email,
    role: SESSION_USER.role,
  });
  return `session=${token}`;
}

function redirectLocation(res: Response): string {
  return res.headers.get("location") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  db.findFeatureFlagByKey.mockResolvedValue(null);
  db.findAuthIdentitiesByUserId.mockResolvedValue([]);
  db.findUserByTelegramChatId.mockResolvedValue(null);
  mockedExchange.mockResolvedValue({
    id_token: "fake-id-token",
    error: null,
  } as unknown as Awaited<ReturnType<typeof exchangeGoogleCode>>);
});

describe("Google callback — link mode (?link=1 cookie)", () => {
  const baseQuery = "?state=s1&code=good-code";

  it("requires a session: anonymous link attempt → linkError, no merge", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-anon", email: "x@gmail.com", emailVerified: true } as never);
    const res = await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, ["mq_oauth_link=1", "mq_oauth_state=s1"])
    );
    expect(redirectLocation(res)).toContain("linkError=no_session");
  });

  it("conflict: google identity owned by ANOTHER account → google_taken, no merge", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-other", email: "x@gmail.com", emailVerified: true } as never);
    db.findAuthIdentity.mockResolvedValue({ userId: OTHER_USER.id, provider: "google", providerUserId: "g-other" });

    const res = await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, [
        "mq_oauth_link=1",
        "mq_oauth_state=s1",
        await sessionCookie(),
      ])
    );
    expect(redirectLocation(res)).toContain("linkError=google_taken");
    expect(db.createAuthIdentity).not.toHaveBeenCalled();
  });

  it("conflict: verified google email belongs to ANOTHER account → google_taken", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-new", email: "b@mq.local", emailVerified: true } as never);
    db.findAuthIdentity.mockResolvedValue(null);
    db.findUserByEmail.mockResolvedValue(OTHER_USER);

    const res = await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, [
        "mq_oauth_link=1",
        "mq_oauth_state=s1",
        await sessionCookie(),
      ])
    );
    expect(redirectLocation(res)).toContain("linkError=google_taken");
  });

  it("clean link: identity row created for the SESSION user", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-42", email: "a@gmail.com", emailVerified: true } as never);
    db.findAuthIdentity.mockResolvedValue(null);
    db.findUserByEmail.mockResolvedValue(null);

    const res = await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, [
        "mq_oauth_link=1",
        "mq_oauth_state=s1",
        await sessionCookie(),
      ])
    );
    expect(redirectLocation(res)).toContain("linkSuccess=google");
    expect(db.createAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SESSION_USER.id, provider: "google", providerUserId: "g-42" })
    );
  });

  it("idempotent: identity already on the session user → success without duplicate rows", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-42", email: "a@gmail.com", emailVerified: true } as never);
    db.findAuthIdentity.mockResolvedValue({ userId: SESSION_USER.id, provider: "google", providerUserId: "g-42" });
    db.findUserByEmail.mockResolvedValue(null);

    const res = await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, [
        "mq_oauth_link=1",
        "mq_oauth_state=s1",
        await sessionCookie(),
      ])
    );
    expect(redirectLocation(res)).toContain("linkSuccess=google");
    expect(db.createAuthIdentity).not.toHaveBeenCalled();
  });

  it("NOT link mode (login): google resolution still runs — the default flow is untouched", async () => {
    mockedVerifyGoogle.mockResolvedValue({ sub: "g-login", email: "a@gmail.com", emailVerified: true } as never);
    db.findAuthIdentity.mockResolvedValue(null);
    db.findUserByEmail.mockResolvedValue(null);
    db.createUser.mockResolvedValue(SESSION_USER);
    db.findUserByUsername.mockResolvedValue(null);

    await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, ["mq_oauth_state=s1"])
    );
    // resolveGoogleLogin ran (createUser for a fresh account or findUserByEmail path)
    expect(redirectLocation((await googleCallbackGET(
      req(`http://localhost:3000/api/auth/google/callback${baseQuery}`, ["mq_oauth_state=s1"])
    )))).toContain("/play");
  });
});

describe("Telegram widget callback — link mode (?link=1)", () => {
  const TG_PARAMS = "id=777&first_name=Al&username=alice_tg&auth_date=9999999999&hash=valid";

  it("requires a session: anonymous → linkError", async () => {
    mockedVerifyTelegram.mockReturnValue({ id: 777 } as never);
    const res = await telegramWidgetCallbackGET(
      req(`http://localhost:3000/api/auth/telegram-widget/callback?link=1&${TG_PARAMS}`)
    );
    expect(redirectLocation(res)).toContain("linkError");
  });

  it("conflict: telegram already owned by ANOTHER account → telegram_taken", async () => {
    mockedVerifyTelegram.mockReturnValue({ id: 777, username: "alice_tg" } as never);
    db.findAuthIdentity.mockResolvedValue({ userId: OTHER_USER.id, provider: "telegram", providerUserId: "777" });

    const res = await telegramWidgetCallbackGET(
      req(`http://localhost:3000/api/auth/telegram-widget/callback?link=1&${TG_PARAMS}`, [await sessionCookie()])
    );
    expect(redirectLocation(res)).toContain("linkError=telegram_taken");
    expect(db.createAuthIdentity).not.toHaveBeenCalled();
  });

  it("legacy conflict: User.telegramChatId owned by ANOTHER account → telegram_taken", async () => {
    mockedVerifyTelegram.mockReturnValue({ id: 777 } as never);
    db.findAuthIdentity.mockResolvedValue(null);
    db.findUserByTelegramChatId.mockResolvedValue({ ...OTHER_USER, telegramChatId: "777" });

    const res = await telegramWidgetCallbackGET(
      req(`http://localhost:3000/api/auth/telegram-widget/callback?link=1&${TG_PARAMS}`, [await sessionCookie()])
    );
    expect(redirectLocation(res)).toContain("linkError=telegram_taken");
  });

  it("clean link: identity created + legacy columns backfilled for the session user", async () => {
    mockedVerifyTelegram.mockReturnValue({ id: 777, username: "alice_tg", photo_url: "https://t.me/i/p.png" } as never);
    db.findAuthIdentity.mockResolvedValue(null);
    db.findUserByTelegramChatId.mockResolvedValue(null);
    db.findUserById.mockResolvedValue({ ...SESSION_USER, telegramChatId: null, telegramUsername: null, avatar: "" });

    const res = await telegramWidgetCallbackGET(
      req(`http://localhost:3000/api/auth/telegram-widget/callback?link=1&${TG_PARAMS}`, [await sessionCookie()])
    );
    expect(redirectLocation(res)).toContain("linkSuccess=telegram");
    expect(db.createAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SESSION_USER.id, provider: "telegram", providerUserId: "777" })
    );
    expect(db.updateUser).toHaveBeenCalledWith(
      SESSION_USER.id,
      expect.objectContaining({ telegramChatId: "777", telegramUsername: "alice_tg" })
    );
  });
});

describe("GET /api/auth/link/providers", () => {
  it("401 without a session", async () => {
    const res = await linkProvidersGET(req("http://localhost:3000/api/auth/link/providers"));
    expect(res.status).toBe(401);
  });

  it("returns linkage state for the session user (no secrets, no other users' data)", async () => {
    db.findAuthIdentitiesByUserId.mockResolvedValue([
      { userId: SESSION_USER.id, provider: "google", providerUserId: "g-1", providerEmail: "a@gmail.com", providerUsername: null },
    ]);
    db.findUserById.mockResolvedValue({ ...SESSION_USER, telegramChatId: null, telegramUsername: null });

    const res = await linkProvidersGET(
      req("http://localhost:3000/api/auth/link/providers", [await sessionCookie()])
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.google).toEqual({ linked: true, email: "a@gmail.com" });
    expect(data.telegram.linked).toBe(false);
    // Never leaks provider user ids
    expect(JSON.stringify(data)).not.toContain("g-1");
  });
});
