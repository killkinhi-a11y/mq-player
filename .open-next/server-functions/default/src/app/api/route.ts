import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler() {
  return NextResponse.json({ message: "Hello, world!" });
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);