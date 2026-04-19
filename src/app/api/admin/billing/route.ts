import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  let userId: string | undefined;
  try {
    const body = await req.json();
    userId = body?.userId;
  } catch { /* body parse failed */ }
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const transactions = await db.transaction.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Calculate MRR data: group subscription transactions by month
    const mrrByMonth: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.status === "completed" && (t.type === "subscription" || t.type === "promo_period")) {
        const date = new Date(t.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        mrrByMonth[key] = (mrrByMonth[key] || 0) + t.amount;
      }
    });

    // Current MRR: current month revenue from active subscriptions
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentMRR = mrrByMonth[currentMonth] || 0;

    // Total revenue
    const totalRevenue = transactions
      .filter((t) => t.status === "completed" && t.type !== "promo_period")
      .reduce((sum, t) => sum + t.amount, 0);

    // Sort months for chart
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

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const body = await req.json();
    const { action, transactionId, userId, userName } = body;

    if (action === "refund") {
      if (!transactionId) {
        return NextResponse.json({ error: "transactionId обязателен" }, { status: 400 });
      }

      const transaction = await db.transaction.update({
        where: { id: transactionId },
        data: { status: "refunded" },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "promo") {
      if (!userId || !userName) {
        return NextResponse.json({ error: "userId и userName обязательны" }, { status: 400 });
      }

      const transaction = await db.transaction.create({
        data: {
          userId,
          userName,
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
