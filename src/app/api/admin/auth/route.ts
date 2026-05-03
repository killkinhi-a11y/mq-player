import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// Admin emails — comma-separated in env var ADMIN_EMAILS, fallback hardcoded
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "killkin.hi@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

async function handler(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    // Check env list first (fast, no DB hit)
    if (ADMIN_EMAILS.includes(emailLower)) {
      return NextResponse.json({ email, isAdmin: true });
    }

    // Fallback: check role in database
    try {
      const user = await db.user.findUnique({
        where: { email: emailLower },
        select: { role: true },
      });
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
export const POST = withRateLimit(RATE_LIMITS.admin, handler);
