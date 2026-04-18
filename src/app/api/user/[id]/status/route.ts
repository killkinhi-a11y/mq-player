import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      select: { lastSeen: true },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const isOnline = user.lastSeen ? (Date.now() - user.lastSeen.getTime()) < 120000 : false;
    return NextResponse.json({
      online: isOnline,
      lastSeen: user.lastSeen?.toISOString() || null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
