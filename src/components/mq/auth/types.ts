// Extracted from AuthView.tsx (Stage III decomposition) — moved verbatim.

export interface AuthProviders {
  google: boolean;
  telegramWidget: boolean;
  telegramBot: boolean;
  telegramBotName: string | null;
  /** Hostnames where the official Telegram widget may mount (v14).
   *  Unbound hosts would render «Bot domain invalid» inside the
   *  cross-origin iframe — we never mount there. */
  telegramWidgetDomains?: string[];
  email: boolean;
  emailDelivery: boolean;
}
