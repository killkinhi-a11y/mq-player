import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const transactions = await db.transaction.findMany({
      orderBy: { createdAt: "desc" },
    });

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
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
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
