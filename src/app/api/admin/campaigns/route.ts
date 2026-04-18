import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const campaigns = await db.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Admin campaigns list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки кампаний" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, subject, htmlBody, segment } = body;

    if (!name || !subject) {
      return NextResponse.json({ error: "name и subject обязательны" }, { status: 400 });
    }

    const campaign = await db.emailCampaign.create({
      data: {
        name,
        subject,
        htmlBody: htmlBody || "",
        segment: segment || "all",
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Admin campaign create error:", error);
    return NextResponse.json({ error: "Ошибка создания кампании" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, sentCount, openCount, clickCount } = body;

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (sentCount !== undefined) data.sentCount = sentCount;
    if (openCount !== undefined) data.openCount = openCount;
    if (clickCount !== undefined) data.clickCount = clickCount;
    if (status === "sent") data.sentAt = new Date();

    const campaign = await db.emailCampaign.update({
      where: { id },
      data,
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Admin campaign update error:", error);
    return NextResponse.json({ error: "Ошибка обновления кампании" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    await db.emailCampaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin campaign delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления кампании" }, { status: 500 });
  }
}
