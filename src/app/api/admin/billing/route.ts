import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string; body: Record<string, unknown> } | NextResponse> {
  let body: Record<string, unknown> = {};
  let userId: string | undefined;
  try { body = await req.json(); userId = body?.userId as string | undefined; } catch { /* body parse failed */ }
  if (!userId) userId = req.nextUrl.searchParams.get("userId") || undefined;
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId, body };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

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

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;
    const { body } = adminCheck;

    const { action, transactionId, userId, userName } = body as Record<string, unknown>;

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
      if (!userId || !userName) {
        return NextResponse.json({ error: "userId и userName обязательны" }, { status: 400 });
      }

      const transaction = await db.transaction.create({
        data: {
          userId: userId as string,
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
