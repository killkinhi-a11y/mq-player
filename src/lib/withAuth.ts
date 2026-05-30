import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE_OPTIONS } from "./auth";

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) => Promise<Response>;

/**
 * Wrap an API route handler with authentication.
 * Verifies the session cookie, extracts userId and userRole.
 * Returns 401 if not authenticated.
 */
export function withAuth(
  handler: AuthenticatedHandler
): (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, ctx) => {
    const token = req.cookies.get(SESSION_COOKIE_OPTIONS.name)?.value;
    if (!token) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    }
    return handler(req, { ...ctx, userId: payload.userId, userRole: payload.role || "user" });
  };
}

/**
 * Wrap an API route handler with admin authentication.
 * Same as withAuth but also checks userRole === "admin".
 * Returns 403 if not admin.
 */
export function withAdminAuth(
  handler: AuthenticatedHandler
): (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return withAuth(async (req, ctx) => {
    if (ctx.userRole !== "admin") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    return handler(req, ctx);
  });
}

/**
 * Validate Content-Type header for state-changing operations.
 * Rejects requests without a proper Content-Type header (CSRF mitigation).
 */
export function validateContentType(req: NextRequest): boolean {
  const ct = req.headers.get("content-type");
  // Allow JSON and form data (for file uploads)
  return (
    ct?.includes("application/json") ||
    ct?.includes("multipart/form-data") ||
    ct?.includes("application/x-www-form-urlencoded") ||
    false
  );
}
