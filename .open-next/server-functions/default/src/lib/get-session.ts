import { cookies } from "next/headers";
import { verifyToken, type SessionPayload } from "./auth";

/**
 * Get the current user session from the httpOnly cookie.
 * Returns null if no valid session exists.
 *
 * Usage in any API route:
 *   const session = await getSession();
 *   if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   const userId = session.userId;
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Require authentication — returns session or throws 401 response.
 * Use in routes where auth is mandatory.
 *
 * Usage:
 *   const session = await requireAuth();
 *   if (!session) return session; // returns 401 NextResponse
 *   const userId = session.userId;
 */
export async function requireAuth(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  return session;
}
