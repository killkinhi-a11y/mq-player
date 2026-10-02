/**
 * @vitest-environment node
 *
 * Token at-rest encryption (src/lib/yandex/token-crypto.ts):
 *   - roundtrip
 *   - ciphertext never contains the plaintext
 *   - wrong JWT_SECRET fails
 *   - tampered ciphertext fails (GCM auth)
 *   - malformed input handling
 */

import { describe, it, expect } from "vitest";

process.env.JWT_SECRET = "crypto-test-secret-abcdefghijklmnopqrstuvwxyz";

import { encryptSecret, decryptSecret, tryDecryptSecret, secretMatches } from "@/lib/yandex/token-crypto";

const TOKEN = "y0_AgAAAAAtest_access_token_VALUE_1234567890abcdef";

describe("AES-256-GCM token encryption", () => {
  it("roundtrips a token", () => {
    const enc = encryptSecret(TOKEN);
    expect(decryptSecret(enc)).toBe(TOKEN);
  });

  it("produces unique ciphertexts (random IV)", () => {
    const a = encryptSecret(TOKEN);
    const b = encryptSecret(TOKEN);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(TOKEN);
    expect(decryptSecret(b)).toBe(TOKEN);
  });

  it("ciphertext never contains the plaintext", () => {
    const enc = encryptSecret(TOKEN);
    expect(enc).not.toContain(TOKEN);
    expect(enc).not.toContain("test_access_token_VALUE");
    // not even a base64 of the raw token leaks: decode and search
    const b64 = Buffer.from(enc.slice(4), "base64url").toString("binary");
    expect(b64).not.toContain(TOKEN.slice(0, 20));
  });

  it("uses the v1 wire format", () => {
    expect(encryptSecret("x").startsWith("v1:")).toBe(true);
  });

  it("fails with a different JWT_SECRET (key rotation detection)", () => {
    const enc = encryptSecret(TOKEN);
    process.env.JWT_SECRET = "different-secret-rotated-key-000000000000";
    expect(() => decryptSecret(enc)).toThrow();
    expect(tryDecryptSecret(enc)).toBeNull();
    // restore
    process.env.JWT_SECRET = "crypto-test-secret-abcdefghijklmnopqrstuvwxyz";
  });

  it("rejects tampered ciphertext (GCM integrity)", () => {
    const enc = encryptSecret(TOKEN);
    const raw = Buffer.from(enc.slice(4), "base64url");
    raw[raw.length - 1] ^= 0xff; // flip last ciphertext byte
    const tampered = "v1:" + Buffer.from(raw).toString("base64url");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects unknown formats and truncated blobs", () => {
    expect(() => decryptSecret("v2:abc")).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
    expect(() => decryptSecret("v1:AAAA")).toThrow();
  });

  it("tryDecryptSecret is null-safe", () => {
    expect(tryDecryptSecret(null)).toBeNull();
    expect(tryDecryptSecret(undefined)).toBeNull();
    expect(tryDecryptSecret("")).toBeNull();
  });

  it("secretMatches compares without throwing", () => {
    const enc = encryptSecret(TOKEN);
    expect(secretMatches(enc, TOKEN)).toBe(true);
    expect(secretMatches(enc, "other")).toBe(false);
    expect(secretMatches("bogus", TOKEN)).toBe(false);
  });
});
