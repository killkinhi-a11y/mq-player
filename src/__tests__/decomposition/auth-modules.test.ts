import { describe, it, expect, vi, afterEach } from "vitest";
import { USERNAME_REGEX, EMAIL_REGEX, USERNAME_LENGTH_MIN, USERNAME_LENGTH_MAX, AUTH_ERROR_MESSAGES } from "@/components/mq/auth/validation";
import { readAuthRedirect } from "@/components/mq/auth/redirect";
import { fetchAuthProviders, requestUsernameCheck } from "@/components/mq/auth/authApi";

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("auth/validation (extracted from AuthView, values unchanged)", () => {
  it("username + email rules", () => {
    expect([USERNAME_LENGTH_MIN, USERNAME_LENGTH_MAX]).toEqual([2, 20]);
    expect(USERNAME_REGEX.test("max_b-1")).toBe(true);
    expect(USERNAME_REGEX.test("макс")).toBe(false);
    expect(EMAIL_REGEX.test("a@b.ru")).toBe(true);
    expect(EMAIL_REGEX.test("a@b")).toBe(false);
    expect(AUTH_ERROR_MESSAGES.blocked).toBe("Аккаунт заблокирован.");
  });
});

describe("auth/redirect.readAuthRedirect", () => {
  it("no params → hadParams false", () => {
    expect(readAuthRedirect()).toMatchObject({ auth: null, hadParams: false, tgSuggestion: null });
  });
  it("parses params and derives a sanitized Telegram username suggestion", () => {
    const payload = btoa(JSON.stringify({ username: "Max_Babich!!" })).replace(/=+$/, "");
    window.history.replaceState(null, "", `/?authStep=telegram-widget-register&token=h.${payload}.s`);
    const r = readAuthRedirect();
    expect(r).toMatchObject({ step: "telegram-widget-register", hadParams: true, tgSuggestion: "max_babich" });
  });
  it("garbage token → no suggestion, no throw", () => {
    window.history.replaceState(null, "", `/?authStep=telegram-widget-register&token=bad`);
    expect(readAuthRedirect().tgSuggestion).toBeNull();
  });
});

describe("auth/authApi (same endpoints)", () => {
  it("fetchAuthProviders hits /api/auth/providers", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ google: true, telegramBot: false })));
    vi.stubGlobal("fetch", f);
    await expect(fetchAuthProviders()).resolves.toMatchObject({ google: true });
    expect(f).toHaveBeenCalledWith("/api/auth/providers");
  });
  it("requestUsernameCheck encodes the name, forwards the signal and exposes ok", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ available: false, error: "x" }), { status: 409 }));
    vi.stubGlobal("fetch", f);
    const ac = new AbortController();
    const r = await requestUsernameCheck("a b", ac.signal);
    expect(f).toHaveBeenCalledWith("/api/auth/username-check?username=a%20b", { signal: ac.signal });
    expect(r).toEqual({ ok: false, data: { available: false, error: "x" } });
  });
});
