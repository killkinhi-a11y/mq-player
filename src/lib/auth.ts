import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

/**
 * Cached JWT secret — TextEncoder().encode() creates a new Uint8Array
 * on every call. At 100 RPS that's 100 allocations/sec (~2 KB garbage/sec).
 * Cached after first access, never re-encoded.
 *
 * The cache is safe because JWT_SECRET is set at deploy time and never
 * changes during the lifetime of the process.
 */
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

export interface SessionPayload {
  userId: string;
  username?: string;
  email?: string;
  role?: string;
}

/**
 * Create a signed JWT token. Expires in 7 days.
 * Uses HS256 — sufficient for single-server. For distributed auth, use RS256.
 */
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/**
 * Verify and decode a JWT token.
 * Returns null on invalid/expired token — never throws.
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      username: payload.username as string | undefined,
      email: payload.email as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch (e) {
    console.warn("[auth] JWT verification failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Cookie options for session ─────────────────────────────────────────────

export const SESSION_COOKIE_OPTIONS = {
  name: "session",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: "/",
};

/**
 * Read + verify the session directly from a NextRequest's cookie header.
 *
 * Unlike getSession() (next/headers — request-store scoped), this works in
 * ANY context that already holds the request: route handlers reading THEIR
 * OWN req (the OAuth callbacks — the browser lands there via top-level
 * navigation, so the cookie travels on the request), and unit tests.
 * Same verification chain (verifyToken); null when absent/invalid.
 */
export async function getSessionFromRequest(
  req: Request
): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE_OPTIONS.name + "="));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE_OPTIONS.name.length + 1));
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Set session cookie on a NextResponse.
 * Convenience helper for login/register/confirm routes.
 */
export async function setSessionCookie(
  response: NextResponse,
  payload: SessionPayload
): Promise<NextResponse> {
  const token = await signToken(payload);
  response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
    httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
    secure: SESSION_COOKIE_OPTIONS.secure,
    sameSite: SESSION_COOKIE_OPTIONS.sameSite,
    maxAge: SESSION_COOKIE_OPTIONS.maxAge,
    path: SESSION_COOKIE_OPTIONS.path,
  });
  return response;
}

/**
 * Clear session cookie (for logout).
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_OPTIONS.name, "", {
    httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
    secure: SESSION_COOKIE_OPTIONS.secure,
    sameSite: SESSION_COOKIE_OPTIONS.sameSite,
    maxAge: 0,
    path: SESSION_COOKIE_OPTIONS.path,
  });
  return response;
}
