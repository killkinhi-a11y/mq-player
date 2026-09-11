/**
 * OAuth helpers — Google OIDC + shared session/CSRF utilities.
 *
 * SECURITY MODEL
 * ──────────────
 * - The browser NEVER receives client secrets. Google exchange and id_token
 *   verification happen exclusively in this server module.
 * - OAuth `state` is a random value stored in a short-lived HttpOnly cookie
 *   (CSRF protection for the authorization-code flow).
 * - id_token is verified cryptographically against Google's JWKS (signature,
 *   issuer, audience, expiration) — claims are never trusted blindly.
 * - Access/refresh tokens are NOT persisted: we only need the one-time
 *   id_token for identity (scope: openid email profile).
 * - "Pending identity" JWTs carry a *verified* Telegram-widget identity from
 *   the callback to the registration step, so the username-completion screen
 *   can never be fed forged provider data.
 */

import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import crypto from "crypto";
import type { NextRequest } from "next/server";

// ── Request origin (redirect target derivation) ─────────────────────────────

/**
 * Derive the request origin from actual headers (NOT req.nextUrl.origin,
 * which Next may normalize to localhost in dev, breaking cookies when the
 * user is on 127.0.0.1 or a proxied host).
 * Precedence: NEXT_PUBLIC_BASE_URL (explicit override) → forwarded headers
 * (Vercel/proxies) → Host header.
 */
export function getRequestOrigin(req: NextRequest): string {
  const override = process.env.NEXT_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  const proto = req.headers.get("x-forwarded-proto") || (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

// ── Google configuration ─────────────────────────────────────────────────────

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Google JWKS — fetched once per process, cached and refreshed by jose. */
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

// ── OAuth state (CSRF) ───────────────────────────────────────────────────────

export const OAUTH_STATE_COOKIE = "mq_oauth_state";
export const OAUTH_STATE_MAX_AGE = 600; // 10 minutes

/** Generate a cryptographically random OAuth state value. */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Constant-time comparison of the state cookie vs. the state query param.
 * Missing either side → invalid.
 */
export function verifyOAuthState(cookieState: string | undefined, queryState: string | null): boolean {
  if (!cookieState || !queryState) return false;
  if (cookieState.length !== queryState.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieState), Buffer.from(queryState));
  } catch {
    return false;
  }
}

// ── Google: authorize + exchange + verify ───────────────────────────────────

export function getGoogleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Build the Google consent screen URL (OIDC, code flow). */
export function buildGoogleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getGoogleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    // prompt=select_account lets returning users pick another account
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokens {
  id_token: string;
  access_token?: string;
}

/** Exchange the authorization code for tokens — server-to-server. */
export async function exchangeGoogleCode(origin: string, code: string): Promise<GoogleTokens | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: getGoogleRedirectUri(origin),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.id_token) return null;
    return { id_token: data.id_token, access_token: data.access_token };
  } catch {
    return null;
  }
}

export interface GoogleIdentity {
  sub: string; // stable Google user ID
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Verify a Google id_token against Google's public keys.
 * Checks: signature (JWKS), issuer, audience (our client id), expiration.
 * Returns the verified identity or null — never throws.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
      clockTolerance: 60,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    return {
      sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

// ── Pending identity tokens (verified provider data → registration step) ────

export interface PendingIdentityPayload {
  kind: "telegram-widget";
  providerUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
}

let _cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (_cachedSecret) return _cachedSecret;
  const secretRaw = process.env.JWT_SECRET;
  if (!secretRaw) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  _cachedSecret = new TextEncoder().encode(secretRaw);
  return _cachedSecret;
}

/**
 * Sign a short-lived pending-identity token (10 minutes).
 * Audience is fixed to "mq:pending-identity" so it can never be replayed as
 * a session token (session JWTs carry no aud claim).
 */
export async function signPendingIdentity(
  payload: PendingIdentityPayload
): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("mq:pending-identity")
    .setExpirationTime("10m")
    .sign(getSecret());
}

/** Verify a pending-identity token. Returns null on invalid/expired. */
export async function verifyPendingIdentity(
  token: string
): Promise<PendingIdentityPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      audience: "mq:pending-identity",
    });
    if (payload.kind !== "telegram-widget") return null;
    return {
      kind: "telegram-widget",
      providerUserId: String(payload.providerUserId),
      username: typeof payload.username === "string" ? payload.username : null,
      firstName: typeof payload.firstName === "string" ? payload.firstName : null,
      lastName: typeof payload.lastName === "string" ? payload.lastName : null,
      photoUrl: typeof payload.photoUrl === "string" ? payload.photoUrl : null,
    };
  } catch {
    return null;
  }
}

// ── Username derivation for provider-created accounts ────────────────────────

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const RESERVED_USERNAMES = [
  "admin", "administrator", "moderator", "support", "help", "system",
  "mq", "mqplayer", "root", "null", "undefined",
];

/**
 * Sanitize a base string (email local part / Google name / Telegram handle)
 * into a valid username: [a-zA-Z0-9_-]{2,20}, lowercase.
 * Returns null when nothing usable remains.
 */
export function sanitizeUsernameBase(base: string | null | undefined): string | null {
  if (!base) return null;
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 20)
    .replace(/^[^a-z0-9]+/, ""); // must start with letter or digit
  if (cleaned.length < 2 || !USERNAME_REGEX.test(cleaned)) return null;
  if (RESERVED_USERNAMES.includes(cleaned)) return null;
  return cleaned;
}

/**
 * Derive a unique username: try base, then base+2..base+99, then
 * user_<random6>. The checker is an async callback so this works with both
 * DB backends. Bounded attempts — never loops forever.
 */
export async function deriveUniqueUsername(
  base: string | null,
  isTaken: (username: string) => Promise<boolean>
): Promise<string> {
  const sanitized = sanitizeUsernameBase(base);
  const candidates: string[] = [];

  if (sanitized) {
    candidates.push(sanitized);
    for (let i = 2; i <= 30; i++) candidates.push(`${sanitized}${i}`);
  }

  for (const candidate of candidates) {
    if (!(await isTaken(candidate))) return candidate;
  }

  // Fallback: random handle — effectively collision-free
  for (let attempt = 0; attempt < 5; attempt++) {
    const fallback = `user_${crypto.randomInt(100000, 999999)}`;
    if (!(await isTaken(fallback))) return fallback;
  }
  // Last resort (astronomically unlikely)
  return `user_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Generate a random password for provider-created accounts.
 * The user never sees it; they can set a real one via password reset
 * (email codes) at any time. Stored only as a bcrypt hash.
 */
export function generateRandomPassword(): string {
  return crypto.randomBytes(24).toString("hex");
}
