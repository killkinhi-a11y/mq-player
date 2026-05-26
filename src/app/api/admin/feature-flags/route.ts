import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const flags = await db.featureFlag.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Admin feature flags list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки флагов" }, { status: 500 });
  }
}

async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();

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

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();

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
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.admin, withAdminAuth(postHandler));
export const PATCH = withRateLimit(RATE_LIMITS.admin, withAdminAuth(patchHandler));
