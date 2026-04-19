import { NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Fetch fresh user data from DB
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatar: true,
        theme: true,
        accent: true,
        confirmed: true,
      },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar || null,
      theme: user.theme,
      accent: user.accent,
      confirmed: user.confirmed,
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
