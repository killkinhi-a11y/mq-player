import { NextRequest, NextResponse } from "next/server";
import { database, isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

interface TransactionRow {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  createdAt: string;
}

async function findAllTransactions(): Promise<TransactionRow[]> {
  if (isTurso()) {
    const t = getTursoClient();
    const result = await t.execute("SELECT * FROM Transaction ORDER BY createdAt DESC");
    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        userId: String(row.userId ?? ""),
        userName: String(row.userName ?? ""),
        amount: Number(row.amount ?? 0),
        currency: String(row.currency ?? "USD"),
        status: String(row.status ?? "completed"),
        type: String(row.type ?? "subscription"),
        createdAt: String(row.createdAt ?? ""),
      };
    });
  }
  // Prisma fallback — use db directly via adapter's underlying connection
  const { db } = await import("@/lib/db");
  const transactions = await db.transaction.findMany({ orderBy: { createdAt: "desc" } });
  return transactions.map((t) => ({
    id: t.id, userId: t.userId, userName: t.userName,
    amount: t.amount, currency: t.currency, status: t.status, type: t.type,
    createdAt: t.createdAt.toISOString(),
  }));
}

async function getHandler(
  _req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const transactions = await findAllTransactions();

    const mrrByMonth: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.status === "completed" && (t.type === "subscription" || t.type === "promo_period")) {
        const date = new Date(t.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        mrrByMonth[key] = (mrrByMonth[key] || 0) + t.amount;
      }
    });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentMRR = mrrByMonth[currentMonth] || 0;

    const totalRevenue = transactions
      .filter((t) => t.status === "completed" && t.type !== "promo_period")
      .reduce((sum, t) => sum + t.amount, 0);

    const sortedMonths = Object.keys(mrrByMonth).sort();
    const mrrData = sortedMonths.map((month) => ({
      month,
      revenue: mrrByMonth[month],
    }));

    return NextResponse.json({
      transactions,
      mrrData,
      currentMRR,
      totalRevenue,
      totalTransactions: transactions.length,
    });
  } catch (error) {
    console.error("Admin billing data error:", error);
    return NextResponse.json({ error: "Ошибка загрузки финансовых данных" }, { status: 500 });
  }
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
    const { action, transactionId, userId: targetUserId, userName } = body as Record<string, unknown>;

    if (action === "refund") {
      if (!transactionId) {
        return NextResponse.json({ error: "transactionId обязателен" }, { status: 400 });
      }
      if (isTurso()) {
        const t = getTursoClient();
        await t.execute({
          sql: "UPDATE Transaction SET status = 'refunded' WHERE id = ?",
          args: [transactionId as string],
        });
        const r = await t.execute({ sql: "SELECT * FROM Transaction WHERE id = ?", args: [transactionId as string] });
        const row = r.rows[0] as Record<string, unknown> | undefined;
        const transaction = row ? {
          id: String(row.id ?? ""),
          userId: String(row.userId ?? ""),
          userName: String(row.userName ?? ""),
          amount: Number(row.amount ?? 0),
          currency: String(row.currency ?? "USD"),
          status: String(row.status ?? "refunded"),
          type: String(row.type ?? "subscription"),
          createdAt: String(row.createdAt ?? ""),
        } : null;
        return NextResponse.json({ transaction });
      }
      const { db } = await import("@/lib/db");
      const transaction = await db.transaction.update({
        where: { id: transactionId as string },
        data: { status: "refunded" },
      });
      return NextResponse.json({ transaction });
    }

    if (action === "promo") {
      if (!targetUserId || !userName) {
        return NextResponse.json({ error: "userId и userName обязательны" }, { status: 400 });
      }
      if (isTurso()) {
        const t = getTursoClient();
        const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        await t.execute({
          sql: "INSERT INTO Transaction (id, userId, userName, amount, currency, status, type, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [id, targetUserId as string, userName as string, 0, "USD", "completed", "promo_period", new Date().toISOString()],
        });
        return NextResponse.json({
          transaction: { id, userId: targetUserId, userName, amount: 0, currency: "USD", status: "completed", type: "promo_period", createdAt: new Date().toISOString() },
        });
      }
      const { db } = await import("@/lib/db");
      const transaction = await db.transaction.create({
        data: {
          userId: targetUserId as string,
          userName: userName as string,
          amount: 0,
          currency: "USD",
          status: "completed",
          type: "promo_period",
        },
      });
      return NextResponse.json({ transaction });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("Admin billing action error:", error);
    return NextResponse.json({ error: "Ошибка выполнения операции" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.admin, withAdminAuth(postHandler));
