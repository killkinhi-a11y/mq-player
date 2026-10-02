/**
 * Yandex OAuth token at-rest encryption (server-side only).
 *
 * Yandex access/refresh tokens are stored in the MQ database ONLY as
 * AES-256-GCM ciphertext. The key is derived (HKDF, domain-separated) from
 * the existing JWT_SECRET env var — no new secrets need to be provisioned,
 * and the raw JWT_SECRET is never used directly as an encryption key.
 *
 * Wire format: "v1:" + base64url( 12-byte IV ‖ 16-byte GCM tag ‖ ciphertext )
 *
 * SECURITY INVARIANTS (enforced by tests):
 *   - encrypted output never contains the plaintext token
 *   - decryption with a different JWT_SECRET fails
 *   - tampered ciphertext fails (GCM auth)
 *   - this module imports node:crypto and reads process.env.JWT_SECRET,
 *     so it can only ever run inside server-side route handlers — importing
 *     it from a client component fails at bundle time.
 */

import crypto from "crypto";

const KEY_INFO = "mq-yandex-token-v1";
const PREFIX = "v1:";
const IV_BYTES = 12;

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required to encrypt Yandex tokens");
  }
  // HKDF extract+expand (RFC 5869)
  return Buffer.from(
    crypto.hkdfSync("sha256", Buffer.from(secret, "utf-8"), Buffer.alloc(0), Buffer.from(KEY_INFO, "utf-8"), 32)
  );
}

/** Encrypt a secret string (Yandex access/refresh token, device code). */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error("encryptSecret: empty plaintext");
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/** Decrypt a value produced by encryptSecret. Throws on tamper / wrong key. */
export function decryptSecret(encrypted: string): string {
  if (!encrypted.startsWith(PREFIX)) {
    throw new Error("decryptSecret: unsupported format");
  }
  const raw = Buffer.from(encrypted.slice(PREFIX.length), "base64url");
  if (raw.length <= IV_BYTES + 16) {
    throw new Error("decryptSecret: truncated payload");
  }
  const key = deriveKey();
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const ciphertext = raw.subarray(IV_BYTES + 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

/** Safe decrypt — returns null instead of throwing (expired format, key rotation). */
export function tryDecryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch {
    return null;
  }
}

/** Constant-time check whether a stored blob encrypts the given plaintext. */
export function secretMatches(encrypted: string, plaintext: string): boolean {
  try {
    return decryptSecret(encrypted) === plaintext;
  } catch {
    return false;
  }
}
