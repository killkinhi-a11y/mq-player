import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { database, isTurso, getTursoClient } from "@/lib/database";

export const maxDuration = 30;
export const TYPING_TTL_MS = 4000;

export const dynamic = "force-dynamic";

/** Get all active (non-expired) typing entries for a given receiver. */
export async function getActiveTypingForUser(receiverId: string): Promise<Array<{ userId: string; contactId: string }>> {
  const cutoff = new Date(Date.now() - TYPING_TTL_MS).toISOString();
  if (isTurso()) {
    const t = getTursoClient();
    const result = await t.execute({
      sql: "SELECT userId, contactId FROM TypingEvent WHERE contactId = ? AND updatedAt > ?",
      args: [receiverId, cutoff],
    });
    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return { userId: String(row.userId ?? ""), contactId: String(row.contactId ?? "") };
    });
  }
  const { db } = await import("@/lib/db");
  const events = await db.typingEvent.findMany({
    where: {
      contactId: receiverId,
      updatedAt: { gt: new Date(cutoff) },
    },
    select: { userId: true, contactId: true },
  });
  return events;
}

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  const { success } = rateLimit({ ip: getClientIp(req), ...RATE_LIMITS.write, key: "typing" });
  if (!success) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();
    const { contactId } = body as { contactId?: string };

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json({ error: "Укажите contactId" }, { status: 400 });
    }

    // Upsert the typing event in DB
    if (isTurso()) {
      const t = getTursoClient();
      const existing = await t.execute({
        sql: "SELECT id FROM TypingEvent WHERE userId = ? AND contactId = ?",
        args: [ctx.userId, contactId],
      });
      if (existing.rows.length > 0) {
        await t.execute({
          sql: "UPDATE TypingEvent SET updatedAt = ? WHERE userId = ? AND contactId = ?",
          args: [new Date().toISOString(), ctx.userId, contactId],
        });
      } else {
        const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        await t.execute({
          sql: "INSERT INTO TypingEvent (id, userId, contactId, updatedAt) VALUES (?, ?, ?, ?)",
          args: [id, ctx.userId, contactId, new Date().toISOString()],
        });
      }
    } else {
      const { db } = await import("@/lib/db");
      await db.typingEvent.upsert({
        where: { userId_contactId: { userId: ctx.userId, contactId } },
        create: { userId: ctx.userId, contactId },
        update: { updatedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Typing indicator error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const POST = withAuth(handler);
