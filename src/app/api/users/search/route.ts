import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const excludeId = searchParams.get("excludeId") || "";

    // Build where clause: no confirmed filter so all registered users are visible
    const where: Record<string, unknown> = {};
    if (excludeId) {
      where.id = { not: excludeId };
    }
    if (q) {
      const qLower = q.toLowerCase();
      where.OR = [
        { username: { contains: q } },
        { username: { contains: qLower } },
        { email: { contains: q } },
        { email: { contains: qLower } },
      ];
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("User search error:", error);
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, handler);
