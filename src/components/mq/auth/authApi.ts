// Auth HTTP service (extracted from AuthView in Stage III). Endpoints, params
// and response handling are unchanged; callers keep their UI state logic.
import type { AuthProviders } from "./types";

/** GET /api/auth/providers — which sign-in methods are available (no secrets). Throws on network/JSON error. */
export async function fetchAuthProviders(): Promise<AuthProviders> {
  const res = await fetch("/api/auth/providers");
  const data = await res.json();
  return data;
}

export interface UsernameCheckResponse {
  available?: boolean;
  error?: string;
}

/** GET /api/auth/username-check — throws AbortError when the signal aborts. */
export async function requestUsernameCheck(
  username: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; data: UsernameCheckResponse }> {
  const res = await fetch(`/api/auth/username-check?username=${encodeURIComponent(username)}`, {
    signal,
  });
  const data = await res.json();
  return { ok: res.ok, data };
}
