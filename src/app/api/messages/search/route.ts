import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";

export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    if (!query) return NextResponse.json({ error: "q обязателен" }, { status: 400 });

    if (isTurso()) {
      const t = getTursoClient();
      const like = `%${query}%`;
      const result = await t.execute({
        sql: `SELECT m.*,
                 s.id as s_id, s.username as s_username, s.avatar as s_avatar,
                 r.id as r_id, r.username as r_username, r.avatar as r_avatar
              FROM Message m
              JOIN User s ON m.senderId = s.id
              JOIN User r ON m.receiverId = r.id
              WHERE (m.senderId = ? OR m.receiverId = ?)
                AND m.deleted = 0
                AND LOWER(m.content) LIKE LOWER(?)
              ORDER BY m.createdAt DESC
              LIMIT 50`,
        args: [userId, userId, like],
      });
      const messages = result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        // P1-fix: decode old ENC: format
        let content = String(r.content ?? "");
        if (content.startsWith("ENC:")) {
          try {
            const parts = content.replace("ENC:", "").split(":");
            content = decodeURIComponent(Buffer.from(parts.slice(1).join(":"), "base64").toString("utf-8"));
          } catch { content = content.replace(/^ENC:[^:]*:/, ""); }
        }
        return {
          id: String(r.id ?? ""),
          content,
          senderId: String(r.senderId ?? ""),
          receiverId: String(r.receiverId ?? ""),
          encrypted: r.encrypted === 1 || r.encrypted === true,
          messageType: String(r.messageType ?? "text"),
          replyToId: r.replyToId != null ? String(r.replyToId) : null,
          edited: r.edited === 1 || r.edited === true,
          editedAt: r.editedAt != null ? String(r.editedAt) : null,
          deleted: false,
          voiceUrl: r.voiceUrl != null ? String(r.voiceUrl) : null,
          voiceDuration: r.voiceDuration != null ? Number(r.voiceDuration) : null,
          createdAt: String(r.createdAt ?? ""),
          sender: { id: String(r.s_id ?? ""), username: String(r.s_username ?? ""), avatar: String(r.s_avatar ?? "") },
          receiver: { id: String(r.r_id ?? ""), username: String(r.r_username ?? ""), avatar: String(r.r_avatar ?? "") },
        };
      });
      return NextResponse.json({ messages });
    }

    const { db } = await import("@/lib/db");
    const messages = await db.message.findMany({
      where: {
        AND: [
          { OR: [{ senderId: userId }, { receiverId: userId }] },
          { deleted: false },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        receiver: { select: { id: true, username: true, avatar: true } },
      },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Search messages error:", error);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, withAuth(handler));
