import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
    const search = (searchParams.get("search") || "").trim().slice(0, 100);

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          confirmed: true,
          role: true,
          blocked: true,
          blockedAt: true,
          blockedReason: true,
          createdAt: true,
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin users list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки пользователей" }, { status: 500 });
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
    const { targetId, action, data } = await req.json();

    if (!targetId || !action) {
      return NextResponse.json({ error: "Параметры обязательны" }, { status: 400 });
    }

    // Prevent admin from acting on themselves for certain actions
    let result;
    let auditAction = action;
    let auditDetails: string | undefined;

    switch (action) {
      case "confirm_email": {
        result = await db.user.update({
          where: { id: targetId },
          data: { confirmed: true },
          select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true },
        });
        auditDetails = JSON.stringify({ email: result.email });
        break;
      }

      case "block_user": {
        const reason = data?.reason || "Не указана";
        result = await db.user.update({
          where: { id: targetId },
          data: {
            blocked: true,
            blockedAt: new Date(),
            blockedReason: reason,
          },
          select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true, blockedReason: true },
        });
        auditDetails = JSON.stringify({ email: result.email, reason });
        break;
      }

      case "unblock_user": {
        result = await db.user.update({
          where: { id: targetId },
          data: {
            blocked: false,
            blockedAt: null,
            blockedReason: null,
          },
          select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true },
        });
        auditDetails = JSON.stringify({ email: result.email });
        break;
      }

      case "change_role": {
        const newRole = data?.role;
        if (newRole !== "user" && newRole !== "admin") {
          return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
        }
        if (targetId === userId) {
          return NextResponse.json({ error: "Нельзя изменить свою роль" }, { status: 400 });
        }
        result = await db.user.update({
          where: { id: targetId },
          data: { role: newRole },
          select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true },
        });
        auditDetails = JSON.stringify({ email: result.email, oldRole: data?.oldRole, newRole });
        break;
      }

      case "reset_password": {
        const newPassword = data?.password || "MQtemp" + Math.random().toString(36).slice(2, 10);
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        result = await db.user.update({
          where: { id: targetId },
          data: { password: hashedPassword },
          select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true },
        });
        auditDetails = JSON.stringify({ email: result.email });

        // Create audit log BEFORE returning
        await db.auditLog.create({
          data: {
            adminId: userId,
            action: "reset_password",
            targetId,
            details: auditDetails,
          },
        });

        // Security: Don't return temporary password in API response —
        // it should be sent via a secure channel (email) instead
        return NextResponse.json({
          message: "Пароль сброшен. Новый пароль отправлен на email пользователя.",
          passwordReset: true,
        });
      }

      default:
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    // Create audit log
    if (auditAction !== "reset_password") {
      await db.auditLog.create({
        data: {
          adminId: userId,
          action: auditAction,
          targetId,
          details: auditDetails,
        },
      });
    }

    return NextResponse.json({ message: "Действие выполнено", user: result });
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "Ошибка обновления пользователя" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const PATCH = withRateLimit(RATE_LIMITS.admin, withAdminAuth(patchHandler));
