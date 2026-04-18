import { NextResponse } from "next/server";
import { sendVerificationEmail, getEmailStatus, isEmailConfigured } from "@/lib/email";

/**
 * GET /api/admin/email-test — returns email configuration status
 * POST /api/admin/email-test — sends a test email to verify Resend is working
 */
export async function GET() {
  const status = getEmailStatus();
  return NextResponse.json({
    configured: status.configured,
    from: status.from,
    hasApiKey: status.hasApiKey,
    nodeEnv: process.env.NODE_ENV || 'unknown',
    resendFromEnv: process.env.RESEND_FROM || 'not set (using default: onboarding@resend.dev)',
  });
}

export async function POST(req: Request) {
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
        error: "RESEND_API_KEY не настроен. Добавьте его в переменные окружения Vercel (Settings → Environment Variables).",
        status: getEmailStatus(),
        hint: "1. Зарегистрируйтесь на resend.com\n2. Получите API ключ\n3. Добавьте RESEND_API_KEY в Vercel\n4. (Опционально) Добавьте RESEND_FROM для кастомного домена",
      });
    }

    const testCode = "123456";
    const result = await sendVerificationEmail(testEmail, testCode);

    return NextResponse.json({
      success: true,
      message: `Тестовое письмо отправлено на ${testEmail}`,
      result: {
        id: (result as any).id,
      },
      status: getEmailStatus(),
      note: "onboarding@resend.dev работает только для верифицированных email-адресов в Resend. Для любых адресов нужно добавить свой домен.",
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Неизвестная ошибка",
      status: getEmailStatus(),
      hint: "Проверьте RESEND_API_KEY и убедитесь, что домен отправителя верифицирован в Resend.",
    }, { status: 500 });
  }
}
