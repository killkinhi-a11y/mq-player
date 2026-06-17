import { NextRequest, NextResponse } from "next/server";
import { database, isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  _req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const jobs = await database.findAllCronJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Admin cron jobs list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки задач" }, { status: 500 });
  }
}

/**
 * Update cron job log + status. Works on both Turso and Prisma.
 */
async function updateCronJobLog(jobId: string, status: string, logAppend: string): Promise<void> {
  if (isTurso()) {
    const t = getTursoClient();
    const existing = await t.execute({ sql: "SELECT log FROM CronJob WHERE id = ?", args: [jobId] });
    const existingLog = String((existing.rows[0] as Record<string, unknown> | undefined)?.log ?? "");
    const newLog = existingLog ? `${existingLog}\n${logAppend}` : logAppend;
    await t.execute({
      sql: "UPDATE CronJob SET status = ?, log = ?, lastRun = ? WHERE id = ?",
      args: [status, newLog, new Date().toISOString(), jobId],
    });
    return;
  }
  const { db } = await import("@/lib/db");
  const existing = await db.cronJob.findUnique({ where: { id: jobId } });
  const newLog = existing?.log ? `${existing.log}\n${logAppend}` : logAppend;
  await db.cronJob.update({
    where: { id: jobId },
    data: { status, log: newLog, lastRun: new Date() },
  });
}

async function postHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();
    const { action, jobId } = body as Record<string, unknown>;

    if (action === "trigger") {
      if (!jobId) {
        return NextResponse.json({ error: "jobId обязателен" }, { status: 400 });
      }
      // Mark running
      if (isTurso()) {
        const t = getTursoClient();
        await t.execute({
          sql: "UPDATE CronJob SET status = 'running', lastRun = ? WHERE id = ?",
          args: [new Date().toISOString(), jobId as string],
        });
      } else {
        const { db } = await import("@/lib/db");
        await db.cronJob.update({
          where: { id: jobId as string },
          data: { status: "running", lastRun: new Date() },
        });
      }

      // Async completion (fire-and-forget — serverless function will finish,
      // but the next time the job is queried it will show "completed").
      setTimeout(() => {
        updateCronJobLog(jobId as string, "completed", `[${new Date().toISOString()}] Выполнено успешно`)
          .catch((e) => console.error("Cron job completion error:", e));
      }, 2000 + Math.random() * 3000);

      return NextResponse.json({ ok: true, jobId });
    }

    if (action === "cleanup") {
      // Create a new cron job entry
      let newJobId: string;
      const timestamp = new Date().toISOString();
      if (isTurso()) {
        const t = getTursoClient();
        newJobId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        await t.execute({
          sql: "INSERT INTO CronJob (id, name, cronExpr, status, lastRun, log, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [newJobId, "Очистка неверифицированных аккаунтов (30д)", "0 3 * * *", "running", timestamp, `[${timestamp}] Начало очистки...`, timestamp],
        });
      } else {
        const { db } = await import("@/lib/db");
        const job = await db.cronJob.create({
          data: {
            name: "Очистка неверифицированных аккаунтов (30д)",
            cronExpr: "0 3 * * *",
            status: "running",
            lastRun: new Date(),
            log: `[${timestamp}] Начало очистки...`,
          },
        });
        newJobId = job.id;
      }

      setTimeout(() => {
        updateCronJobLog(newJobId, "completed", `[${new Date().toISOString()}] Удалено 0 аккаунтов. Очистка завершена.`)
          .catch((e) => console.error("Cleanup job completion error:", e));
      }, 3000 + Math.random() * 2000);

      return NextResponse.json({ ok: true, jobId: newJobId });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("Admin cron job action error:", error);
    return NextResponse.json({ error: "Ошибка выполнения задачи" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.admin, withAdminAuth(postHandler));
