/**
 * V2 Spotify — PKCE primitives (lib/spotify/pkce.ts).
 *
 * Verifies the Authorization Code + PKCE building blocks against the RFC 7636
 * behavior used by the researched references (Spotiamp auth.js, Lumen).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateCodeVerifier,
  codeChallengeFromVerifier,
  base64UrlEncode,
  spotifyRedirectUri,
  getStoredClientId,
  setStoredClientId,
  getStoredAccess,
  getStoredRefresh,
  getStoredExpiry,
  getStoredProduct,
  storeTokens,
  storeProduct,
  storeVerifier,
  takeVerifier,
  clearAllSpotifyStorage,
  storedAccessIsValid,
} from "@/lib/spotify/pkce";

describe("PKCE primitives", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates verifiers of the requested length from the RFC charset", () => {
    const v = generateCodeVerifier(64);
    expect(v).toHaveLength(64);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    const v2 = generateCodeVerifier(64);
    expect(v2).not.toBe(v); // random
  });

  it("base64url-encodes without padding / + / =", () => {
    // SHA-256("test") digest bytes contain all the classic base64 hazards.
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x3d, 0x2b, 0x2f]);
    const enc = base64UrlEncode(bytes);
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("derives the S256 challenge for a known verifier (RFC 7636 appendix B vector)", async () => {
    // RFC 7636 Appendix B: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await codeChallengeFromVerifier(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("derives a stable challenge for the same verifier", async () => {
    const v = generateCodeVerifier(64);
    expect(await codeChallengeFromVerifier(v)).toBe(await codeChallengeFromVerifier(v));
  });
});

describe("PKCE redirect URI", () => {
  it("uses the current origin + /spotify/callback path", () => {
    expect(spotifyRedirectUri()).toBe("http://localhost:3000/spotify/callback");
  });
});

describe("token storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads tokens with expiry math", () => {
    storeTokens("acc123", 3600, "ref456");
    expect(getStoredAccess()).toBe("acc123");
    expect(getStoredRefresh()).toBe("ref456");
    // Expiry is ~1h in the future → valid now
    expect(storedAccessIsValid()).toBe(true);
    expect(storedAccessIsValid(Date.now() + 3600_000 + 60_000)).toBe(false);
  });

  it("treats access as expired inside the 30s safety margin", () => {
    storeTokens("acc", 20, "ref"); // expires in 20s
    expect(storedAccessIsValid()).toBe(false); // 30s margin → invalid
  });

  it("verifier is single-use (takeVerifier removes it)", () => {
    storeVerifier("v-1");
    expect(takeVerifier()).toBe("v-1");
    expect(takeVerifier()).toBe(null);
  });

  it("product tier round-trips", () => {
    storeProduct("premium");
    expect(getStoredProduct()).toBe("premium");
  });

  it("client id round-trips and logout clears everything", () => {
    setStoredClientId("cid-1");
    expect(getStoredClientId()).toBe("cid-1");
    storeTokens("a", 100, "r");
    clearAllSpotifyStorage();
    expect(getStoredClientId()).toBe(null);
    expect(getStoredAccess()).toBe(null);
    expect(getStoredRefresh()).toBe(null);
    expect(getStoredExpiry()).toBe(0);
    expect(getStoredProduct()).toBe(null);
  });
});
