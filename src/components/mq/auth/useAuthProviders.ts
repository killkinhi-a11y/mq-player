"use client";

// Server probe of available auth providers (no secrets) + Telegram bot availability.
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useEffect, useState } from "react";
import type { AuthProviders } from "./types";
import { fetchAuthProviders } from "./authApi";

export function useAuthProviders() {
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [tgBotName, setTgBotName] = useState<string | null>(null);
  const [tgBotConfigured, setTgBotConfigured] = useState<boolean | null>(null);
  const [tgBotLoading, setTgBotLoading] = useState(true);

  // ─── Fetch provider availability on mount ───────────────────────────
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const data = await fetchAuthProviders();
        setProviders(data);
        setTgBotConfigured(data.telegramBot);
        setTgBotName(data.telegramBotName || null);
      } catch {
        setTgBotConfigured(false);
        setProviders(null);
      } finally {
        setTgBotLoading(false);
      }
    };
    fetchProviders();
  }, []);

  return { providers, tgBotConfigured, tgBotLoading, tgBotName };
}
