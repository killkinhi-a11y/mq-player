import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    await db.user.update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
