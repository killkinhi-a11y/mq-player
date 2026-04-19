import { NextResponse } from "next/server";
import { sendVerificationEmail, getEmailStatus, isEmailConfigured } from "@/lib/email";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET  /api/admin/email-test — returns Brevo email configuration status
 * POST /api/admin/email-test — sends a test email to verify Brevo is working
 */
async function getHandler() {
  const status = getEmailStatus();
  return NextResponse.json({
    configured: status.configured,
    provider: status.provider,
    senderName: status.senderName,
    senderEmail: status.senderEmail,
    hasApiKey: status.hasApiKey,
    nodeEnv: process.env.NODE_ENV || "unknown",
  });
}

async function postHandler(req: Request) {
  try {
    const body = await req.json();
    const testEmail = body.email;

    if (!testEmail) {
      return NextResponse.json(
        { error: "Укажите email для тестового отправления" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      return NextResponse.json(
        { error: "Некорректный email" },
        { status: 400 }
      );
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({
        success: false,
        error: "BREVO_API_KEY или BREVO_SENDER_EMAIL не настроены.",
        status: getEmailStatus(),
        hint: "1. Зарегистрируйтесь на brevo.com\n2. Settings → SMTP & API → сгенерируйте API ключ\n3. Settings → Senders → добавьте и верифицируйте email\n4. Добавьте BREVO_API_KEY и BREVO_SENDER_EMAIL в Vercel (Settings → Environment Variables)",
      });
    }

    const testCode = "123456";
    const result = await sendVerificationEmail(testEmail, testCode);

    return NextResponse.json({
      success: !(result as any).mock,
      message: `Тестовое письмо отправлено на ${testEmail}`,
      result,
      status: getEmailStatus(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Неизвестная ошибка",
      status: getEmailStatus(),
      hint: "Проверьте BREVO_API_KEY и убедитесь, что отправитель верифицирован в Brevo (Settings → Senders).",
    }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, getHandler);
export const POST = withRateLimit(RATE_LIMITS.admin, postHandler);
