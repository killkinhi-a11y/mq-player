/**
 * link-result — W13 OAuth link-result relay unit tests.
 *
 * Pins the StrictMode-safe semantics the AccountLinkingCard relies on:
 *  - capture: a URL that carries a result always wins (fresh redirect
 *    overwrites); a param-less URL never clobbers the buffer;
 *  - consume: PURE read — idempotent (dev StrictMode double-invokes the
 *    useState initializer; both invocations must see the same value);
 *  - clear: separate, called from an effect after commit — the banner
 *    shows exactly once per redirect and never replays on remounts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshModule() {
  vi.resetModules();
  return import("../../lib/link-result");
}

function setUrl(search: string) {
  window.history.replaceState(null, "", `/play${search}`);
}

describe("lib/link-result (W13 banner relay)", () => {
  beforeEach(() => {
    vi.resetModules();
    setUrl("");
  });

  it("captures linkSuccess; consume is a PURE read (repeatable), clear stops it", async () => {
    setUrl("?linkSuccess=google");
    const m = await freshModule();
    m.captureLinkResultFromLocation();
    // pure read: the double-invoked initializer sees the same value twice
    expect(m.consumeLinkResult()).toEqual({ ok: "google", err: null });
    expect(m.consumeLinkResult()).toEqual({ ok: "google", err: null });
    // cleared from the effect -> later mounts see nothing (no replay)
    m.clearLinkResult();
    expect(m.consumeLinkResult()).toEqual({ ok: null, err: null });
  });

  it("captures linkError (conflict) from the URL", async () => {
    setUrl("?linkError=telegram_taken");
    const m = await freshModule();
    m.captureLinkResultFromLocation();
    expect(m.consumeLinkResult()).toEqual({ ok: null, err: "telegram_taken" });
  });

  it("a fresh redirect result overwrites a stale buffered one", async () => {
    setUrl("?linkError=google_taken");
    const m = await freshModule();
    m.captureLinkResultFromLocation();
    // user goes through ANOTHER OAuth redirect -> new result must win
    setUrl("?linkSuccess=telegram");
    m.captureLinkResultFromLocation();
    expect(m.consumeLinkResult()).toEqual({ ok: "telegram", err: null });
  });

  it("a param-less load does NOT clobber an already-captured result", async () => {
    setUrl("?linkSuccess=telegram");
    const m = await freshModule();
    m.captureLinkResultFromLocation();
    // e.g. history-sync already rewrote the URL before a re-render
    setUrl("?v=settings");
    m.captureLinkResultFromLocation();
    expect(m.consumeLinkResult()).toEqual({ ok: "telegram", err: null });
  });

  it("no params captured -> consume returns nulls (no banner on navigation)", async () => {
    const m = await freshModule();
    m.captureLinkResultFromLocation();
    expect(m.consumeLinkResult()).toEqual({ ok: null, err: null });
  });

  it("consume without capture -> nulls", async () => {
    const m = await freshModule();
    expect(m.consumeLinkResult()).toEqual({ ok: null, err: null });
  });
});
