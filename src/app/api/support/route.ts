import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: NextRequest) {
  try {
    const { email, subject, message, userId } = await req.json();

    if (!email || !subject || !message) {
      return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
    }

    if (subject.length < 3) {
      return NextResponse.json({ error: "Тема должна быть не менее 3 символов" }, { status: 400 });
    }

    if (message.length < 10) {
      return NextResponse.json({ error: "Сообщение должно быть не менее 10 символов" }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: "Сообщение слишком длинное (макс. 2000 символов)" }, { status: 400 });
    }

    // Save to database
    await db.supportMessage.create({
      data: { email, subject, message, userId: userId || null },
    });

    // Notify admin via email
    if (resend) {
      try {
        await resend.emails.send({
          from: "MQ Player <onboarding@resend.dev>",
          to: "killkin.hi@gmail.com",
          subject: `[Поддержка MQ] ${subject}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0e0e0e;border-radius:12px;color:#fff;">
              <div style="width:40px;height:40px;background:#e03131;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:18px;font-weight:900;color:white;">mq</span>
              </div>
              <h2 style="margin:0 0 12px;font-size:18px;">Новое сообщение в поддержку</h2>
              <table style="width:100%;margin-bottom:16px;font-size:14px;">
                <tr><td style="color:#888;padding:4px 0;">От:</td><td style="color:#fff;">${email}</td></tr>
                <tr><td style="color:#888;padding:4px 0;">Тема:</td><td style="color:#fff;">${subject}</td></tr>
                ${userId ? `<tr><td style="color:#888;padding:4px 0;">UserID:</td><td style="color:#fff;">${userId}</td></tr>` : ""}
                <tr><td style="color:#888;padding:4px 0;">Дата:</td><td style="color:#fff;">${new Date().toLocaleString("ru-RU")}</td></tr>
              </table>
              <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;">
                <p style="color:#ccc;margin:0;white-space:pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("Failed to send support email:", emailErr);
        // Don't fail — message is saved in DB
      }
    }

    return NextResponse.json({ message: "Сообщение отправлено. Мы ответим на вашу почту." });
  } catch (error) {
    console.error("Support message error:", error);
    return NextResponse.json({ error: "Ошибка при отправке сообщения" }, { status: 500 });
  }
}
