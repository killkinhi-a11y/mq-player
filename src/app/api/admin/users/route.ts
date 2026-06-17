import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import bcrypt from "bcryptjs";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";
import { sendPasswordResetEmail } from "@/lib/email";

async function getHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
    const search = (searchParams.get("search") || "").trim().slice(0, 100);

    const { users, total } = await database.findManyUsers({ page, limit, search });

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

    let auditAction = action;
    let auditDetails: string | undefined;

    switch (action) {
      case "confirm_email": {
        await database.updateUser(targetId, { confirmed: true });
        const u = await database.findUserById(targetId);
        auditDetails = JSON.stringify({ email: u?.email });
        break;
      }

      case "block_user": {
        const reason = data?.reason || "Не указана";
        await database.updateUser(targetId, {
          blocked: true,
          blockedAt: new Date().toISOString(),
          blockedReason: reason,
        });
        const u = await database.findUserById(targetId);
        auditDetails = JSON.stringify({ email: u?.email, reason });
        break;
      }

      case "unblock_user": {
        await database.updateUser(targetId, {
          blocked: false,
          blockedAt: null,
          blockedReason: null,
        });
        const u = await database.findUserById(targetId);
        auditDetails = JSON.stringify({ email: u?.email });
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
        await database.updateUser(targetId, { role: newRole });
        const u = await database.findUserById(targetId);
        auditDetails = JSON.stringify({ email: u?.email, oldRole: data?.oldRole, newRole });
        break;
      }

      case "reset_password": {
        const newPassword = "MQtemp" + Math.random().toString(36).slice(2, 10);
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await database.updateUser(targetId, { password: hashedPassword });
        const u = await database.findUserById(targetId);
        auditDetails = JSON.stringify({ email: u?.email });

        // Create audit log
        await database.createAuditLog({
          adminId: userId,
          action: "reset_password",
          targetId,
          details: auditDetails,
        });

        // Actually send the new password via email (M2 fix — previously this
        // endpoint returned "Пароль отправлен на email" but never sent it).
        let emailSent = false;
        let emailError: string | undefined;
        if (u?.email) {
          try {
            await sendPasswordResetEmail(u.email, newPassword);
            emailSent = true;
          } catch (e) {
            emailError = e instanceof Error ? e.message : String(e);
            console.error("[admin reset_password] Failed to send email:", e);
          }
        }

        // Security: never return the temporary password in the API response.
        return NextResponse.json({
          message: emailSent
            ? "Пароль сброшен. Новый пароль отправлен на email пользователя."
            : emailError
              ? `Пароль сброшен, но не удалось отправить email: ${emailError}. Сообщите пароль пользователю другим каналом.`
              : "Пароль сброшен, но email не отправлен (адрес не найден).",
          passwordReset: true,
          emailSent,
        });
      }

      default:
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    // Create audit log for non-reset_password actions (reset_password creates its own above)
    if (auditAction !== "reset_password") {
      await database.createAuditLog({
        adminId: userId,
        action: auditAction,
        targetId,
        details: auditDetails,
      });
    }

    const updatedUser = await database.findUserById(targetId);
    return NextResponse.json({
      message: "Действие выполнено",
      user: updatedUser ? {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        confirmed: updatedUser.confirmed,
        blocked: updatedUser.blocked,
      } : null,
    });
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "Ошибка обновления пользователя" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const PATCH = withRateLimit(RATE_LIMITS.admin, withAdminAuth(patchHandler));
