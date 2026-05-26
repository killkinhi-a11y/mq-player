import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// GET /api/user/theme — get user's saved theme
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    const user = await database.findUserById(userId);

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
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { theme, accent } = await req.json();

    const updateData: Record<string, string> = {};
    if (theme !== undefined) {
      if (typeof theme !== "string" || theme.length > 50) {
        return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
      }
      updateData.theme = theme;
    }
    if (accent !== undefined) {
      if (typeof accent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(accent)) {
        return NextResponse.json({ error: "Invalid accent color" }, { status: 400 });
      }
      updateData.accent = accent;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No data to update" }, { status: 400 });
    }

    await database.updateUser(userId, updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save theme error:", error);
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
