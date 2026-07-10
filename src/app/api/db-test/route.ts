import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTurso } from "@/lib/database";

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    usingTurso: isTurso(),
    databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + "...",
    tursoUrl: process.env.TURSO_DATABASE_URL ? "SET" : "NOT SET",
    tursoToken: process.env.TURSO_AUTH_TOKEN ? "SET" : "NOT SET",
  };

  // Try Prisma connection with retry
  for (let i = 0; i < 3; i++) {
    try {
      const count = await db.user.count();
      results.db = { ok: true, userCount: count, attempt: i + 1 };
      return NextResponse.json(results);
    } catch (err: any) {
      results[`attempt_${i+1}`] = {
        error: err.message?.slice(0, 300),
        code: err.code,
      };
      if (i < 2) await new Promise(r => setTimeout(r, 3000));
    }
  }

  results.db = { ok: false, allRetriesFailed: true };
  return NextResponse.json(results, { status: 500 });
}
