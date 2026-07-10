import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, type SessionPayload } from "./auth";

/**
 * Get the current user session from the httpOnly cookie.
 * Returns null if no valid session exists — does NOT throw.
 *
 * Use when auth is optional:
 *   const session = await getSession();
 *   if (!session) { return publicContent(); }
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Require authentication — returns session or 401 NextResponse.
 *
 * The caller MUST check the return type:
 *   const session = await requireAuth();
 *   if (session instanceof NextResponse) return session;
 *   const userId = session.userId; // TypeScript narrows to SessionPayload
 *
 * This pattern ensures type-safety: after the instanceof check,
 * TypeScript knows session is SessionPayload, not null.
 */
export async function requireAuth(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
