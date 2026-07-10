import { NextResponse } from "next/server";
import { database, isTurso, ensureTursoSchema } from "@/lib/database";

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    usingTurso: isTurso(),
    tursoUrl: process.env.TURSO_DATABASE_URL ? "SET" : "NOT SET",
    tursoToken: process.env.TURSO_AUTH_TOKEN ? "SET" : "NOT SET",
  };

  // If using Turso, ensure schema exists first
  if (isTurso()) {
    try {
      await ensureTursoSchema();
      results.schemaInit = "ok";
    } catch (e: any) {
      results.schemaInit = { error: e.message?.slice(0, 200) };
    }
  }

  // Test DB via the unified database adapter (works for both Turso and Prisma)
  try {
    const count = await database.countUsers();
    results.db = { ok: true, userCount: count, backend: isTurso() ? "turso" : "prisma" };
  } catch (err: any) {
    results.db = {
      ok: false,
      error: err.message?.slice(0, 300),
      backend: isTurso() ? "turso" : "prisma",
    };
  }

  return NextResponse.json(results);
}
