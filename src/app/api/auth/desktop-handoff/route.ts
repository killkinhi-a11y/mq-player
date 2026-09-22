import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { verifyDesktopHandoffToken } from "@/lib/desktop-handoff";

/**
 * POST /api/auth/desktop-handoff — exchange a one-time desktop handoff
 * code (issued by the Google OAuth callback when started with
 * ?desktop=1) for a regular 7-day session JWT.
 *
 * The desktop app stores this token in its DPAPI-protected cookie jar
 * (Rust localhost proxy attaches it as the `session` cookie on every
 * request) — the desktop equivalent of the httpOnly browser cookie.
 */
export async function POST(req: NextRequest) {
  let code: string | undefined;
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code : undefined;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!code || code.length > 4096) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const claims = await verifyDesktopHandoffToken(code);
  if (!claims) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 401 });
  }

  const token = await signToken({
    userId: claims.userId,
    username: claims.username,
    email: claims.email,
    role: claims.role,
  });

  return NextResponse.json({ token });
}
