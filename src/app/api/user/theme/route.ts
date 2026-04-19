import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/user/theme?userId=xxx — get user's saved theme
async function getHandler(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { theme: true, accent: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ theme: user.theme, accent: user.accent });
  } catch (error) {
    console.error("Get theme error:", error);
    return NextResponse.json({ error: "Failed to get theme" }, { status: 500 });
  }
}

// POST /api/user/theme — save user's theme preference
async function postHandler(req: NextRequest) {
  try {
    const { userId, theme, accent } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const updateData: Record<string, string> = {};
    if (theme !== undefined) updateData.theme = theme;
    if (accent !== undefined) updateData.accent = accent;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No data to update" }, { status: 400 });
    }

    await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save theme error:", error);
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.write, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
