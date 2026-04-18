import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'MQ Player <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Returns whether real email sending is available (vs. mock/dev mode).
 */
export function isEmailConfigured(): boolean {
  return !!resend;
}

/**
 * Returns email configuration status for admin diagnostics.
 */
export function getEmailStatus(): { configured: boolean; from: string; hasApiKey: boolean } {
  return {
    configured: !!resend,
    from: RESEND_FROM,
    hasApiKey: !!RESEND_API_KEY,
  };
}

export async function sendVerificationEmail(to: string, code: string) {
  if (!resend) {
    // In development mode, log the code so devs can see it
    const isDev = process.env.NODE_ENV === 'development';
    console.error(`[EMAIL NOT CONFIGURED] RESEND_API_KEY is not set. Verification code for ${to}: ${code}`);
    if (isDev) {
      console.log(`[DEV MODE] Code will appear in server logs. Set RESEND_API_KEY in .env to send real emails.`);
    }
    // In production without email configured, this is a critical issue
    // Return mock result but callers should check isEmailConfigured()
    return { id: 'mock', mock: true };
  }

  try {
    const result = await resend.emails.send({
      from: RESEND_FROM,
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
    return result;
  } catch (error: any) {
    console.error('[REEND ERROR] Failed to send verification email:', error?.message || error);
    // Re-throw so callers can handle the failure
    throw new Error(`Email send failed: ${error?.message || 'Unknown error'}`);
  }
}

export async function sendPasswordResetEmail(to: string, code: string) {
  if (!resend) {
    const isDev = process.env.NODE_ENV === 'development';
    console.error(`[EMAIL NOT CONFIGURED] RESEND_API_KEY is not set. Password reset code for ${to}: ${code}`);
    if (isDev) {
      console.log(`[DEV MODE] Code will appear in server logs. Set RESEND_API_KEY in .env to send real emails.`);
    }
    return { id: 'mock', mock: true };
  }

  try {
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to,
      subject: 'Восстановление пароля — MQ Player',
      html: `
        <div style="max-width:400px;margin:0 auto;font-family:system-ui,sans-serif;text-align:center;padding:32px;background:#0e0e0e;border-radius:16px;">
          <div style="width:56px;height:56px;background:#e03131;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <span style="font-size:24px;font-weight:900;color:white;">mq</span>
          </div>
          <h1 style="color:#ffffff;font-size:20px;margin:0 0 8px;">Восстановление пароля</h1>
          <p style="color:#888888;font-size:14px;margin:0 0 24px;">Введите этот код для сброса пароля:</p>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:0 0 24px;">
            <span style="font-size:32px;font-weight:700;color:#e03131;letter-spacing:8px;">${code}</span>
          </div>
          <p style="color:#666666;font-size:12px;margin:0;">Код действует 10 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
        </div>
      `,
    });
    return result;
  } catch (error: any) {
    console.error('[RESEND ERROR] Failed to send password reset email:', error?.message || error);
    throw new Error(`Email send failed: ${error?.message || 'Unknown error'}`);
  }
}
