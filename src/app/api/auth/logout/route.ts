import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { clearSessionCookie } from "@/lib/auth";

async function handler() {
  const response = NextResponse.json({ message: "Вы вышли из аккаунта" });
  // Use clearSessionCookie — sets maxAge: 0 with all cookie options (sameSite, secure, path)
  // response.cookies.delete() doesn't set sameSite/secure, browser may ignore it
  return clearSessionCookie(response);
}

export const POST = withRateLimit(RATE_LIMITS.auth, handler);
