import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { db } from "@/lib/db";

export const maxDuration = 30;
export const TYPING_TTL_MS = 4000;

export const dynamic = "force-dynamic";

/** Get all active (non-expired) typing entries for a given receiver from the DB. */
export async function getActiveTypingForUser(receiverId: string): Promise<Array<{ userId: string; contactId: string }>> {
  const cutoff = new Date(Date.now() - TYPING_TTL_MS);
  const events = await db.typingEvent.findMany({
    where: {
      contactId: receiverId,
      updatedAt: { gt: cutoff },
    },
    select: {
      userId: true,
      contactId: true,
    },
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

    // Upsert the typing event in DB — updatedAt is auto-set by @updatedAt
    await db.typingEvent.upsert({
      where: {
        userId_contactId: { userId: ctx.userId, contactId },
      },
      create: {
        userId: ctx.userId,
        contactId,
      },
      update: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Typing indicator error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const POST = withAuth(handler);
