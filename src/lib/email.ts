import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(to: string, code: string) {
  if (!resend) {
    console.log(`[EMAIL MOCK] Verification code for ${to}: ${code}`);
    return { id: 'mock' };
  }

  return resend.emails.send({
    from: 'MQ Player <onboarding@resend.dev>',
    to,
    subject: 'Код подтверждения — MQ Player',
    html: `
      <div style="max-width:400px;margin:0 auto;font-family:system-ui,sans-serif;text-align:center;padding:32px;background:#0e0e0e;border-radius:16px;">
        <div style="width:56px;height:56px;background:#e03131;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <span style="font-size:24px;font-weight:900;color:white;">mq</span>
        </div>
        <h1 style="color:#ffffff;font-size:20px;margin:0 0 8px;">Подтверждение email</h1>
        <p style="color:#888888;font-size:14px;margin:0 0 24px;">Введите этот код для подтверждения аккаунта:</p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:0 0 24px;">
          <span style="font-size:32px;font-weight:700;color:#e03131;letter-spacing:8px;">${code}</span>
        </div>
        <p style="color:#666666;font-size:12px;margin:0;">Код действует 10 минут. Если вы не запрашивали подтверждение, проигнорируйте это письмо.</p>
      </div>
    `,
  });
}
