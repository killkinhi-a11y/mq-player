import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Public API — returns maintenance mode status.
 * Checks for a feature flag with key "maintenance_mode".
 */
export async function GET() {
  try {
    const flag = await db.featureFlag.findUnique({
      where: { key: "maintenance_mode" },
    });

    const isEnabled = flag?.enabled === true;

    return NextResponse.json({
      maintenance: isEnabled,
      message: isEnabled
        ? flag.description || "Проводятся технические работы. Скоро вернёмся!"
        : null,
    });
  } catch (error) {
    console.error("Maintenance check error:", error);
    // On error, default to NOT in maintenance to avoid blocking all users
    return NextResponse.json({ maintenance: false, message: null });
  }
}
