import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  let userId: string | undefined;
  try {
    const body = await req.json();
    userId = body?.userId;
  } catch { /* body parse failed */ }
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
    const actionFilter = searchParams.get("action") || "";

    const where: Record<string, unknown> = {};
    if (actionFilter) {
      where.action = actionFilter;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          admin: {
            select: { id: true, username: true, email: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin audit logs error:", error);
    return NextResponse.json({ error: "Ошибка загрузки логов" }, { status: 500 });
  }
}
