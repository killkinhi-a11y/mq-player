import { NextRequest, NextResponse } from "next/server";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { database } from "@/lib/database";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    const user = await database.findUserById(userId);

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("User profile error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const body = await req.json();

    const updateData: Record<string, string> = {};
    if (body.username !== undefined) {
      const usernameRegex = /^[a-zA-Z0-9_-]{2,20}$/;
      if (!usernameRegex.test(body.username)) {
        return NextResponse.json({ error: "Некорректное имя пользователя" }, { status: 400 });
      }
      // Check uniqueness
      const existing = await database.findUserFirstWhereNotId({ username: body.username, id: userId });
      if (existing) {
        return NextResponse.json({ error: "Имя уже занято" }, { status: 409 });
      }
      updateData.username = body.username;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    await database.updateUser(userId, updateData);
    const updatedUser = await database.findUserById(userId);

    return NextResponse.json({
      user: {
        id: updatedUser!.id,
        username: updatedUser!.username,
        email: updatedUser!.email,
        avatar: updatedUser!.avatar,
        role: updatedUser!.role,
      },
    });
  } catch (error) {
    console.error("User profile update error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
