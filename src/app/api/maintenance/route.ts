import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Public API — returns maintenance mode status.
 * Auto-creates the flag if it doesn't exist (so banner works out of the box).
 */
export async function GET() {
  try {
    let flag = await db.featureFlag.findUnique({
      where: { key: "maintenance_mode" },
    });

    // Auto-create flag on first access (idempotent)
    if (!flag) {
      flag = await db.featureFlag.create({
        data: {
          key: "maintenance_mode",
          name: "Технические работы",
          description: "Включает баннер о технических работах для всех пользователей и блокирует регистрацию/вход",
          enabled: false,
        },
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
    const ip = getClientIp(req);
    const { success } = rateLimit({ ip, limit: 5, window: 60, key: "maintenance-toggle" });
    if (!success) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    }

    const { enabled, adminEmail } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled обязателен" }, { status: 400 });
    }

    let flag = await db.featureFlag.findUnique({
      where: { key: "maintenance_mode" },
    });

    if (!flag) {
      flag = await db.featureFlag.create({
        data: {
          key: "maintenance_mode",
          name: "Технические работы",
          description: "Включает баннер о технических работах для всех пользователей и блокирует регистрацию/вход",
          enabled: false,
        },
      });
    }

    flag = await db.featureFlag.update({
      where: { key: "maintenance_mode" },
      data: { enabled, updatedAt: new Date() },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: enabled ? "maintenance_enabled" : "maintenance_disabled",
          details: `Maintenance mode ${enabled ? "включён" : "выключен"}${adminEmail ? ` администратором ${adminEmail}` : ""}`,
          admin: adminEmail || "unknown",
        },
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
