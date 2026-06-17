import { NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Public API — returns the currently active seasonal theme (if any).
 * Called by the client on app load to auto-apply seasonal themes
 * enabled by admins via Feature Flags.
 */
async function handler() {
  try {
    if (isTurso()) {
      const t = getTursoClient();
      // Use LIKE 'theme_%' since Turso doesn't support Prisma's startsWith
      const result = await t.execute(
        "SELECT id, key, name, enabled, createdAt, updatedAt FROM FeatureFlag WHERE key LIKE 'theme\\_%' ESCAPE '\\' AND enabled = 1"
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ activeTheme: null, flags: [] });
      }
      const rows = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          key: String(row.key ?? ""),
          name: String(row.name ?? ""),
          updatedAt: String(row.updatedAt ?? ""),
        };
      });
      const sorted = rows.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      const themeKey = sorted[0].key.replace("theme_", "");
      return NextResponse.json({
        activeTheme: themeKey,
        flags: sorted.map((f) => ({
          key: f.key,
          name: f.name,
          themeKey: f.key.replace("theme_", ""),
        })),
      });
    }

    const { db } = await import("@/lib/db");
    const flags = await db.featureFlag.findMany({
      where: { key: { startsWith: "theme_" }, enabled: true },
    });
    if (flags.length === 0) {
      return NextResponse.json({ activeTheme: null, flags: [] });
    }
    const sorted = flags.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const themeKey = sorted[0].key.replace("theme_", "");
    return NextResponse.json({
      activeTheme: themeKey,
      flags: sorted.map((f) => ({
        key: f.key,
        name: f.name,
        themeKey: f.key.replace("theme_", ""),
      })),
    });
  } catch (error) {
    console.error("Seasonal theme fetch error:", error);
    return NextResponse.json({ activeTheme: null, flags: [] });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
