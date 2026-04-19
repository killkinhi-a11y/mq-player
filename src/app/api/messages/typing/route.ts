import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// ── In-memory typing indicator map ──
// Key: `${userId}→${contactId}` — who is typing to whom
// Value: timestamp of last typing event
// TTL: 4 seconds — if no new event, the entry is considered expired
const typingMap = new Map<string, { userId: string; contactId: string; timestamp: number }>();

export const TYPING_TTL_MS = 4000;

/** Get or create the typing map entry; update timestamp. */
export function setTypingIndicator(userId: string, contactId: string): void {
  const key = `${userId}→${contactId}`;
  typingMap.set(key, { userId, contactId, timestamp: Date.now() });
}

/** Get all active (non-expired) typing entries for a given receiver. */
export function getTypingIndicatorsForUser(receiverId: string): Array<{ userId: string; contactId: string; timestamp: number }> {
  const now = Date.now();
  const results: Array<{ userId: string; contactId: string; timestamp: number }> = [];

  for (const [key, entry] of typingMap.entries()) {
    // Entry is for this user if someone is typing TO them (entry.contactId === receiverId)
    if (entry.contactId === receiverId && now - entry.timestamp < TYPING_TTL_MS) {
      results.push(entry);
    }
  }
  return results;
}

/** Clean up expired entries from the map. */
export function cleanupTypingMap(): void {
  const now = Date.now();
  for (const [key, entry] of typingMap.entries()) {
    if (now - entry.timestamp >= TYPING_TTL_MS) {
      typingMap.delete(key);
    }
  }
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), ...RATE_LIMITS.write, key: "typing" });
  if (!success) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    const body = await req.json();
    const { contactId } = body as { contactId?: string };

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json({ error: "Укажите contactId" }, { status: 400 });
    }

    // Update the typing indicator (in-memory, no DB)
    setTypingIndicator(session.userId, contactId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Typing indicator error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
