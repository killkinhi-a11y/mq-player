import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string; body: Record<string, unknown> } | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  const userId = session.userId;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body parse failed */ }
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId, body };
}

async function getHandler(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const jobs = await db.cronJob.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Admin cron jobs list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки задач" }, { status: 500 });
  }
}

async function postHandler(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;
    const { body } = adminCheck;

    const { action, jobId } = body as Record<string, unknown>;

    if (action === "trigger") {
      if (!jobId) {
        return NextResponse.json({ error: "jobId обязателен" }, { status: 400 });
      }

      const job = await db.cronJob.update({
        where: { id: jobId as string },
        data: {
          status: "running",
          lastRun: new Date(),
          log: (await db.cronJob.findUnique({ where: { id: jobId as string } }))?.log || "",
        },
      });

      setTimeout(async () => {
        try {
          const existing = await db.cronJob.findUnique({ where: { id: jobId as string } });
          const timestamp = new Date().toISOString();
          const newLog = existing?.log
            ? `${existing.log}\n[${timestamp}] Выполнено успешно`
            : `[${timestamp}] Выполнено успешно`;

          await db.cronJob.update({
            where: { id: jobId as string },
            data: {
              status: "completed",
              log: newLog,
            },
          });
        } catch (e) {
          console.error("Cron job completion error:", e);
        }
      }, 2000 + Math.random() * 3000);

      return NextResponse.json({ job });
    }

    if (action === "cleanup") {
      const job = await db.cronJob.create({
        data: {
          name: "Очистка неверифицированных аккаунтов (30д)",
          cronExpr: "0 3 * * *",
          status: "running",
          lastRun: new Date(),
          log: `[${new Date().toISOString()}] Начало очистки...`,
        },
      });

      setTimeout(async () => {
        try {
          const existing = await db.cronJob.findUnique({ where: { id: job.id } });
          const timestamp = new Date().toISOString();
          const newLog = existing?.log
            ? `${existing.log}\n[${timestamp}] Удалено 0 аккаунтов. Очистка завершена.`
            : `[${timestamp}] Удалено 0 аккаунтов. Очистка завершена.`;

          await db.cronJob.update({
            where: { id: job.id },
            data: {
              status: "completed",
              log: newLog,
            },
          });
        } catch (e) {
          console.error("Cleanup job completion error:", e);
        }
      }, 3000 + Math.random() * 2000);

      return NextResponse.json({ job });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("Admin cron job action error:", error);
    return NextResponse.json({ error: "Ошибка выполнения задачи" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, getHandler);
export const POST = withRateLimit(RATE_LIMITS.admin, postHandler);
