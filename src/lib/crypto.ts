// ───────────────────────────────────────────────────────────────────────────
// Messenger "encryption" utilities — HONEST VERSION (M1 / Honesty Pass)
//
// Previously this file implemented base64 + fixed-IV theater marketed to the
// user as "end-to-end encryption". That was a security lie: anyone with read
// access to the DB could trivially decode every message.
//
// The messenger in MQ Player uses standard HTTPS transport encryption (TLS)
// between client and server. Messages are stored at rest in the database
// exactly as the client sends them — no client-side encryption is performed.
//
// This file now exposes only:
//   - passthrough helpers that preserve the existing call-sites in
//     MessengerView.tsx / MessageBubble.tsx / API routes without lying
//     about what they do;
//   - honest status strings for the UI.
//
// If you want REAL end-to-end encryption, implement WebCrypto ECDH (P-256)
// key exchange + AES-GCM 256 with per-message random IV, store private keys
// in IndexedDB (never on the server), and store only ciphertext in the
// Message.content column. Do NOT re-introduce base64 / XOR / fixed-IV
// schemes — they are not encryption.
// ───────────────────────────────────────────────────────────────────────────

/**
 * No-op passthrough. The messenger relies on transport-layer encryption (TLS)
 * between client and server; no additional client-side encryption is applied.
 *
 * Kept for backwards compatibility with MessengerView.tsx which calls this on
 * outbound messages. Returns the input unchanged.
 */
export async function simulateEncrypt(text: string): Promise<string> {
  return text;
}

/** Synchronous no-op decrypt — see simulateEncrypt. */
export function simulateDecryptSync(encryptedText: string): string {
  return encryptedText;
}

/** Async no-op decrypt — see simulateEncrypt. */
export async function simulateDecrypt(encryptedText: string): Promise<string> {
  return encryptedText;
}

/** Always returns false — we no longer tag messages with an encryption prefix. */
export function isEncrypted(_text: string): boolean {
  return false;
}

/**
 * Honest description shown in the UI. Was "XOR Obfuscation (demo)".
 * Now reflects the actual security model: TLS for transport, no at-rest
 * encryption on the client side.
 */
export function getEncryptionStatus(): string {
  return "TLS (transport)";
}

/**
 * Visual fingerprint for the encryption-info dialog. With TLS-only there is
 * no per-conversation key, so we render a deterministic placeholder derived
 * from the session — clearly labeled, not presented as a real key.
 */
export function generateMockFingerprint(): string {
  // Deterministic placeholder so the UI shows a stable value per session
  // instead of random garbage that looked like a real key fingerprint.
  return "TLS-ONLY  NO-E2E  NO-ATREST";
}
