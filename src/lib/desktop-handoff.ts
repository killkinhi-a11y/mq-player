/*
 * Desktop auth handoff — stateless one-time code that bridges a
 * system-browser OAuth login into the MQ Player desktop app.
 *
 * Flow (spec §27, §34):
 *   desktop app ──opens system browser──> /api/auth/google?desktop=1
 *   browser     <──Google consent───────> /api/auth/google/callback
 *   callback    ──redirect──────────────> /desktop-auth?c=<handoffToken>
 *   /desktop-auth page ──POST /api/auth/desktop-handoff──> { token }
 *   page navigates to mq://auth#<session JWT> → OS opens MQ Player
 *   desktop deep-link handler → Rust cookie jar → session restored.
 *
 * The handoff token is a short-lived (120s) HS256 JWT with a dedicated
 * `aud` — it can ONLY be exchanged at /api/auth/desktop-handoff, never
 * used directly as a session. The page URL keeps the one-time code only;
 * the session JWT itself never enters browser history (it travels via
 * POST body → fragment navigation).
 */
import { SignJWT, jwtVerify } from "jose";

const HANDOFF_AUD = "mq:desktop-handoff";
const HANDOFF_TTL = "120s";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export interface DesktopHandoffClaims {
  userId: string;
  username?: string;
  email?: string;
  role?: string;
}

export async function signDesktopHandoffToken(
  claims: DesktopHandoffClaims
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(HANDOFF_AUD)
    .setExpirationTime(HANDOFF_TTL)
    .sign(getSecret());
}

/**
 * Verify a handoff token. Returns null unless the token is
 * signature-valid, unexpired AND audience-scoped to the desktop handoff
 * (a regular session token can NOT be replayed here and vice versa).
 */
export async function verifyDesktopHandoffToken(
  token: string
): Promise<DesktopHandoffClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      audience: HANDOFF_AUD,
    });
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    return {
      userId: payload.userId,
      username: payload.username as string | undefined,
      email: payload.email as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}
