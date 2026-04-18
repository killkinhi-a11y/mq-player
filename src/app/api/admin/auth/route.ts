import { NextRequest, NextResponse } from "next/server";

// Admin emails — comma-separated in env var ADMIN_EMAILS, fallback hardcoded
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "killkin.hi@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    }

    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

    return NextResponse.json({
      email,
      isAdmin,
      adminEmails: ADMIN_EMAILS,
    });
  } catch (error) {
    console.error("Admin auth check error:", error);
    return NextResponse.json({ error: "Ошибка проверки прав" }, { status: 500 });
  }
}
