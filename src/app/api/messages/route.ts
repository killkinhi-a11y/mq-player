import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const senderId = req.nextUrl.searchParams.get("senderId");
    const receiverId = req.nextUrl.searchParams.get("receiverId");

    if (!senderId || !receiverId) {
      return NextResponse.json(
        { error: "senderId и receiverId обязательны" },
        { status: 400 }
      );
    }

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке сообщений" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content, senderId, receiverId, encrypted } = await req.json();

    if (!content || !senderId || !receiverId) {
      return NextResponse.json(
        { error: "Все поля обязательны" },
        { status: 400 }
      );
    }

    const message = await db.message.create({
      data: {
        content,
        senderId,
        receiverId,
        encrypted: encrypted !== false,
      },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке сообщения" },
      { status: 500 }
    );
  }
}
