import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string; body: Record<string, unknown> } | NextResponse> {
  let body: Record<string, unknown> = {};
  let userId: string | undefined;
  try { body = await req.json(); userId = body?.userId as string | undefined; } catch { /* body parse failed */ }
  if (!userId) userId = req.nextUrl.searchParams.get("userId") || undefined;
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId, body };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const flags = await db.featureFlag.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Admin feature flags list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки флагов" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;
    const { body } = adminCheck;

    const { key, name, description, enabled } = body as Record<string, unknown>;

    if (!key || !name) {
      return NextResponse.json({ error: "key и name обязательны" }, { status: 400 });
    }

    const existing = await db.featureFlag.findUnique({ where: { key: key as string } });
    if (existing) {
      return NextResponse.json({ error: "Флаг с таким ключом уже существует" }, { status: 400 });
    }

    const flag = await db.featureFlag.create({
      data: {
        key: key as string,
        name: name as string,
        description: (description as string) || null,
        enabled: (enabled as boolean) ?? false,
      },
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Admin feature flag create error:", error);
    return NextResponse.json({ error: "Ошибка создания флага" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;
    const { body } = adminCheck;

    const { id, enabled, name, description } = body as Record<string, unknown>;

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;

    const flag = await db.featureFlag.update({
      where: { id: id as string },
      data,
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Admin feature flag update error:", error);
    return NextResponse.json({ error: "Ошибка обновления флага" }, { status: 500 });
  }
}
