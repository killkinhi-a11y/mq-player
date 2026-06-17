import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// Admin emails — comma-separated in env var ADMIN_EMAILS
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    // Only allow users to check their OWN admin status (ctx already has userId/userRole from withAuth)
    // We need to look up the session user's email to compare
    const currentUser = await database.findUserById(ctx.userId);
    if (currentUser && currentUser.email?.toLowerCase() !== emailLower && currentUser.role !== "admin") {
      return NextResponse.json({ error: "Можно проверить только свой статус" }, { status: 403 });
    }

    // Check env list first (fast, no DB hit)
    if (ADMIN_EMAILS.includes(emailLower)) {
      return NextResponse.json({ email, isAdmin: true });
    }

    // Fallback: check role in database (via Turso adapter — works in prod)
    try {
      const user = await database.findUserByEmail(emailLower);
      if (user && user.role === "admin") {
        return NextResponse.json({ email, isAdmin: true });
      }
    } catch {
      // DB unavailable — don't block, just deny
    }

    return NextResponse.json({ email, isAdmin: false });
  } catch (error) {
    console.error("Admin auth check error:", error);
    return NextResponse.json({ error: "Ошибка проверки прав" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.admin, withAuth(handler));
