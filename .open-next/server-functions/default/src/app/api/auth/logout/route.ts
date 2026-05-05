import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { SESSION_COOKIE_OPTIONS } from "@/lib/auth";

async function handler() {
  const response = NextResponse.json({ message: "Вы вышли из аккаунта" });
  response.cookies.delete(SESSION_COOKIE_OPTIONS.name);
  return response;
}

export const POST = withRateLimit(RATE_LIMITS.auth, handler);
