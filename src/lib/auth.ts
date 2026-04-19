import { SignJWT, jwtVerify } from "jose";

const secretRaw = process.env.JWT_SECRET;
if (!secretRaw) {
  throw new Error("JWT_SECRET environment variable is required");
}
const secret = new TextEncoder().encode(secretRaw);

export interface SessionPayload {
  userId: string;
  username?: string;
  email?: string;
  role?: string;
}

/**
 * Create a signed JWT token for a user session.
 * Tokens expire in 7 days.
 */
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * Verify and decode a JWT token.
 * Returns null if token is invalid or expired.
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      username: payload.username as string | undefined,
      email: payload.email as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
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
 * Set session cookie on a NextResponse.
 * Convenience helper for login/register/confirm routes.
 */
import type { NextResponse } from "next/server";

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
