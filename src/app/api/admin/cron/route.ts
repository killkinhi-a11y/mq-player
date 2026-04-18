import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const jobs = await db.cronJob.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Admin cron jobs list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки задач" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, jobId } = body;

    if (action === "trigger") {
      if (!jobId) {
        return NextResponse.json({ error: "jobId обязателен" }, { status: 400 });
      }

      const job = await db.cronJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          lastRun: new Date(),
          log: (await db.cronJob.findUnique({ where: { id: jobId } }))?.log || "",
        },
      });

      // Simulate async completion
      setTimeout(async () => {
        try {
          const existing = await db.cronJob.findUnique({ where: { id: jobId } });
          const timestamp = new Date().toISOString();
          const newLog = existing?.log
            ? `${existing.log}\n[${timestamp}] Выполнено успешно`
            : `[${timestamp}] Выполнено успешно`;

          await db.cronJob.update({
            where: { id: jobId },
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

      // Simulate async completion
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
