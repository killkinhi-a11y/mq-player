import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Public API — returns the currently active seasonal theme (if any).
 * Called by the client on app load to auto-apply seasonal themes
 * enabled by admins via Feature Flags.
 */
export async function GET() {
  try {
    const flags = await db.featureFlag.findMany({
      where: {
        key: { startsWith: "theme_" },
        enabled: true,
      },
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
