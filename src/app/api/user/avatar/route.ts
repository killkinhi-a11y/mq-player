import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { avatar } = await req.json();

    if (!avatar) {
      return NextResponse.json({ error: "avatar обязателен" }, { status: 400 });
    }

    // Validate it's a data URL (base64 image)
    if (typeof avatar !== "string" || !avatar.startsWith("data:image/")) {
      return NextResponse.json({ error: "Некорректный формат изображения" }, { status: 400 });
    }

    // Limit size: base64 string should not exceed ~700KB (roughly 500KB image)
    if (avatar.length > 700_000) {
      return NextResponse.json({ error: "Изображение слишком большое (макс. 500 КБ)" }, { status: 400 });
    }

    const user = await database.findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    await database.updateUser(userId, { avatar });

    return NextResponse.json({ message: "Аватарка обновлена", avatar });
  } catch (error) {
    console.error("Avatar update error:", error);
    return NextResponse.json({ error: "Ошибка при обновлении аватарки" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.upload, withAuth(handler));
