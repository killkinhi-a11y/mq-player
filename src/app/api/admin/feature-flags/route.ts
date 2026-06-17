import { NextRequest, NextResponse } from "next/server";
import { database, isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  _req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const flags = await database.findAllFeatureFlags();
    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Admin feature flags list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки флагов" }, { status: 500 });
  }
}

async function postHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
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

    const existing = await database.findFeatureFlagByKey(key as string);
    if (existing) {
      return NextResponse.json({ error: "Флаг с таким ключом уже существует" }, { status: 400 });
    }

    const flag = await database.createFeatureFlag({
      key: key as string,
      name: name as string,
      description: (description as string | undefined) ?? null,
      enabled: (enabled as boolean | undefined) ?? false,
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Admin feature flag create error:", error);
    return NextResponse.json({ error: "Ошибка создания флага" }, { status: 500 });
  }
}

async function patchHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();

    const { id, enabled, name, description, key } = body as Record<string, unknown>;

    if (!id && !key) {
      return NextResponse.json({ error: "id или key обязателен" }, { status: 400 });
    }

    const data: { enabled?: boolean; name?: string; description?: string } = {};
    if (enabled !== undefined) data.enabled = enabled as boolean;
    if (name !== undefined) data.name = name as string;
    if (description !== undefined) data.description = description as string;

    // The adapter's updateFeatureFlag uses key; if we only have id, look it up first.
    let flagKey = (key as string | undefined);
    if (!flagKey && id) {
      if (isTurso()) {
        const t = getTursoClient();
        const r = await t.execute({ sql: "SELECT key FROM FeatureFlag WHERE id = ?", args: [id as string] });
        if (r.rows.length === 0) {
          return NextResponse.json({ error: "Флаг не найден" }, { status: 404 });
        }
        flagKey = String((r.rows[0] as Record<string, unknown>).key);
      } else {
        // Prisma fallback — query directly via adapter's path
        const all = await database.findAllFeatureFlags();
        const found = all.find((f) => f.id === (id as string));
        if (!found) return NextResponse.json({ error: "Флаг не найден" }, { status: 404 });
        flagKey = found.key;
      }
    }

    const flag = await database.updateFeatureFlag(flagKey!, data);
    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Admin feature flag update error:", error);
    return NextResponse.json({ error: "Ошибка обновления флага" }, { status: 500 });
  }
}

async function deleteHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "key обязателен" }, { status: 400 });
    }
    await database.deleteFeatureFlag(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin feature flag delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления флага" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.admin, withAdminAuth(postHandler));
export const PATCH = withRateLimit(RATE_LIMITS.admin, withAdminAuth(patchHandler));
export const DELETE = withRateLimit(RATE_LIMITS.admin, withAdminAuth(deleteHandler));
