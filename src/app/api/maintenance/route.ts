import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

/**
 * Public API — returns maintenance mode status.
 * Auto-creates the flag if it doesn't exist (so banner works out of the box).
 */
export async function GET() {
  try {
    let flag = await database.findFeatureFlagByKey("maintenance_mode");

    // Auto-create flag on first access (idempotent)
    if (!flag) {
      flag = await database.createFeatureFlag({
        key: "maintenance_mode",
        name: "Технические работы",
        description: "Включает баннер о технических работах для всех пользователей и блокирует регистрацию/вход",
        enabled: false,
      });
    }

    const isEnabled = flag.enabled === true;

    return NextResponse.json({
      maintenance: isEnabled,
      message: isEnabled
        ? flag.description || "Проводятся технические работы. Скоро вернёмся!"
        : null,
    });
  } catch (error) {
    console.error("Maintenance check error:", error);
    return NextResponse.json({ maintenance: false, message: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const user = await database.findUserById(userId);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const ip = getClientIp(req);
    const { success } = rateLimit({ ip, limit: 5, window: 60, key: "maintenance-toggle" });
    if (!success) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    }

    const { enabled } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled обязателен" }, { status: 400 });
    }

    let flag = await database.findFeatureFlagByKey("maintenance_mode");

    if (!flag) {
      flag = await database.createFeatureFlag({
        key: "maintenance_mode",
        name: "Технические работы",
        description: "Включает баннер о технических работах для всех пользователей и блокирует регистрацию/вход",
        enabled: false,
      });
    }

    flag = (await database.updateFeatureFlag("maintenance_mode", { enabled }))!;

    // Audit log
    try {
      await database.createAuditLog({
        adminId: userId,
        action: enabled ? "maintenance_enabled" : "maintenance_disabled",
        details: `Maintenance mode ${enabled ? "включён" : "выключен"} администратором ${user.email}`,
      });
    } catch (auditError) {
      console.error("Audit log error:", auditError);
    }

    return NextResponse.json({
      success: true,
      maintenance: flag.enabled,
      message: flag.enabled
        ? flag.description || "Проводятся технические работы. Скоро вернёмся!"
        : null,
    });
  } catch (error) {
    console.error("Maintenance toggle error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
