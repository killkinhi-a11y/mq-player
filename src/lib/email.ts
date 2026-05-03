/**
 * Brevo (Sendinblue) email provider.
 *
 * Brevo free tier: 300 emails/day, no domain required.
 * Only need to verify your sender email in Brevo dashboard.
 *
 * Setup:
 *   1. Sign up at https://www.brevo.com
 *   2. Go to Settings → SMTP & API → generate an API key
 *   3. Go to Settings → Senders → add & verify your email
 *   4. Set BREVO_API_KEY and BREVO_SENDER_EMAIL env vars
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "mq";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL; // e.g. "killkin.hi@gmail.com"

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Returns whether real email sending is available (vs. mock/dev mode).
 */
export function isEmailConfigured(): boolean {
  return !!(BREVO_API_KEY && BREVO_SENDER_EMAIL);
}

/**
 * Returns email configuration status for admin diagnostics.
 */
export function getEmailStatus(): {
  configured: boolean;
  provider: string;
  senderName: string;
  senderEmail: string | null;
  hasApiKey: boolean;
} {
  return {
    configured: isEmailConfigured(),
    provider: "brevo",
    senderName: BREVO_SENDER_NAME,
    senderEmail: BREVO_SENDER_EMAIL || null,
    hasApiKey: !!BREVO_API_KEY,
  };
}

/**
 * Low-level: send an email via Brevo Transactional API.
 * No extra dependencies — uses native fetch.
 */
async function sendEmail({ to, subject, htmlContent }: { to: string; subject: string; htmlContent: string }) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    return { mock: true, id: "mock" };
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Build the mq email template.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailTemplate(title: string, description: string, code: string): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCode = escapeHtml(code);
  return `
    <div style="max-width:400px;margin:0 auto;font-family:system-ui,sans-serif;text-align:center;padding:32px;background:#0e0e0e;border-radius:16px;">
      <div style="width:56px;height:56px;background:#e03131;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
        <span style="font-size:24px;font-weight:900;color:white;">mq</span>
      </div>
      <h1 style="color:#ffffff;font-size:20px;margin:0 0 8px;">${safeTitle}</h1>
      <p style="color:#888888;font-size:14px;margin:0 0 24px;">${safeDescription}</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:0 0 24px;">
        <span style="font-size:32px;font-weight:700;color:#e03131;letter-spacing:8px;">${safeCode}</span>
      </div>
      <p style="color:#666666;font-size:12px;margin:0;">Код действует 10 минут. Если вы не запрашивали это письмо, проигнорируйте его.</p>
    </div>
  `;
}

// ── Public helpers ──────────────────────────────────────────────

export async function sendVerificationEmail(to: string, code: string) {
  if (!isEmailConfigured()) {
    console.error(`[EMAIL NOT CONFIGURED] BREVO_API_KEY or BREVO_SENDER_EMAIL not set. Code for ${to}: ${code}`);
    return { id: "mock", mock: true };
  }

  try {
    const result = await sendEmail({
      to,
      subject: "Код подтверждения — mq",
      htmlContent: emailTemplate(
        "Подтверждение email",
        "Введите этот код для подтверждения аккаунта:",
        code,
      ),
    });
    return result;
  } catch (error: any) {
    console.error("[BREVO ERROR] Verification email failed:", error?.message || error);
    throw new Error(`Email send failed: ${error?.message || "Unknown error"}`);
  }
}

export async function sendPasswordResetEmail(to: string, code: string) {
  if (!isEmailConfigured()) {
    console.error(`[EMAIL NOT CONFIGURED] BREVO_API_KEY or BREVO_SENDER_EMAIL not set. Reset code for ${to}: ${code}`);
    return { id: "mock", mock: true };
  }

  try {
    const result = await sendEmail({
      to,
      subject: "Восстановление пароля — mq",
      htmlContent: emailTemplate(
        "Восстановление пароля",
        "Введите этот код для сброса пароля:",
        code,
      ),
    });
    return result;
  } catch (error: any) {
    console.error("[BREVO ERROR] Password reset email failed:", error?.message || error);
    throw new Error(`Email send failed: ${error?.message || "Unknown error"}`);
  }
}
