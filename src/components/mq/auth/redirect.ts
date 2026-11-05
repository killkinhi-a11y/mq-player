// Extracted from AuthView.tsx (Stage III decomposition) — moved verbatim.

export interface AuthRedirect {
  auth: string | null;
  error: string | null;
  step: string | null;
  token: string | null;
  hadParams: boolean;
  /** Username suggestion prefilled from the signed Telegram widget token. */
  tgSuggestion: string | null;
}

/** Pure read of the OAuth redirect params (no URL mutation). */
export function readAuthRedirect(): AuthRedirect {
  const params = new URL(window.location.href).searchParams;
  const auth = params.get("auth");
  const error = params.get("authError");
  const step = params.get("authStep");
  const token = params.get("token");
  let tgSuggestion: string | null = null;
  if (step === "telegram-widget-register" && token) {
    // Prefill suggestion from the signed token payload (server re-verifies it)
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      if (payload.username) {
        const suggestion = String(payload.username).toLowerCase().slice(0, 20).replace(/[^a-z0-9_-]/g, "");
        if (suggestion.length >= 2) tgSuggestion = suggestion;
      }
    } catch {
      // Prefill is best-effort only
    }
  }
  return { auth, error, step, token, hadParams: !!(auth || error || step || token), tgSuggestion };
}
