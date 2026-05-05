// Simple simulated encryption utilities for the messenger
// This is for UI demonstration purposes only

const ENCRYPTION_PREFIX = "ENC:";
const MOCK_IV = "a1b2c3d4e5f6g7h8";

export async function simulateEncrypt(text: string): Promise<string> {
  // Simulate encryption with a simple encoding
  const encoded = btoa(encodeURIComponent(text));
  return `${ENCRYPTION_PREFIX}${MOCK_IV}:${encoded}`;
}

export function simulateDecryptSync(encryptedText: string): string {
  if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedText;
  }
  try {
    const parts = encryptedText.replace(ENCRYPTION_PREFIX, "").split(":");
    const encoded = parts.slice(1).join(":");
    return decodeURIComponent(atob(encoded));
  } catch {
    return encryptedText;
  }
}

export async function simulateDecrypt(encryptedText: string): Promise<string> {
  return simulateDecryptSync(encryptedText);
}

export function isEncrypted(text: string): boolean {
  return text.startsWith(ENCRYPTION_PREFIX);
}

export function getEncryptionStatus(): string {
  return "AES-256-GCM";
}

export function generateMockFingerprint(): string {
  const chars = "ABCDEF0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    if (i > 0 && i % 4 === 0) result += " ";
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
