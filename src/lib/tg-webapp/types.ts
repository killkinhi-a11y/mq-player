/**
 * Telegram Mini App SDK types — minimal subset we use.
 * Full spec: https://core.telegram.org/bots/webapps
 */

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface TelegramWebAppInitData {
  query_id?: string;
  user?: TelegramWebAppUser;
  receiver?: TelegramWebAppUser;
  chat?: { id: number; type: string; title?: string; photo_url?: string; username?: string };
  chat_type?: "sender" | "chat" | "channel" | "group" | "supergroup";
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
}

export interface TelegramWebAppThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramWebAppInitData;
  version: string;
  platform: "web" | "ios" | "android" | "macos" | "tdesktop" | "unknown";
  colorScheme: "light" | "dark";
  themeParams: TelegramWebAppThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  BottomBarBgColor?: string;
  setHeaderColor: (color: "bg_color" | "secondary_bg_color") => void;
  setBackgroundColor: (color: "bg_color" | "secondary_bg_color") => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  enableVerticalSwipes: () => void;
  disableVerticalSwipes: () => void;
  onEvent: (event: string, callback: () => void) => void;
  offEvent: (event: string, callback: () => void) => void;
  sendData: (data: string) => void;
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isProgressVisible: boolean;
    isActive: boolean;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setParams: (params: { text?: string; color?: string; text_color?: string; isActive?: boolean; isVisible?: boolean }) => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  showAlert: (message: string, cb?: () => void) => void;
  showConfirm: (message: string, cb: (ok: boolean) => void) => void;
  showPopup: (
    params: {
      title?: string;
      message: string;
      buttons?: Array<{ id?: string; type: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }>;
    },
    cb?: (id: string) => void
  ) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  setBottomBarColor?: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Get the Telegram WebApp instance if running inside Telegram Mini App.
 * Returns null if not in Telegram (e.g. opened in a regular browser).
 */
export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

/**
 * Check if we're running inside Telegram Mini App.
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.Telegram?.WebApp?.initData);
}

/**
 * Get the initData string from Telegram (for sending to our auth endpoint).
 * Returns empty string if not in Telegram.
 */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData || "";
}

/**
 * Apply Telegram theme colors to our CSS variables.
 * This makes the Mini App feel native — uses Telegram's dark/light theme.
 */
export function applyTelegramTheme(): void {
  const wa = getTelegramWebApp();
  if (!wa) return;

  const root = document.documentElement;

  // Telegram provides bg_color, text_color, hint_color, button_color, etc.
  // We map them to our design tokens.
  if (wa.themeParams.bg_color) {
    root.style.setProperty("--mq-bg", wa.themeParams.bg_color);
  }
  if (wa.themeParams.text_color) {
    root.style.setProperty("--mq-text", wa.themeParams.text_color);
  }
  if (wa.themeParams.hint_color) {
    root.style.setProperty("--mq-text-muted", wa.themeParams.hint_color);
  }
  if (wa.themeParams.button_color) {
    root.style.setProperty("--mq-accent", wa.themeParams.button_color);
  }
  if (wa.themeParams.secondary_bg_color) {
    root.style.setProperty("--mq-surface", wa.themeParams.secondary_bg_color);
  }

  // Mark that we're in Telegram (CSS can use this for compact layouts)
  root.setAttribute("data-telegram-webapp", "true");
  root.setAttribute("data-color-scheme", wa.colorScheme);

  // Ready signal — Telegram will hide the loading indicator
  wa.ready();
  wa.expand();
}

/**
 * Trigger a haptic feedback (vibration) for tactile response.
 * Falls back gracefully outside Telegram.
 */
export function haptic(
  type: "light" | "medium" | "heavy" | "rigid" | "soft" | "success" | "error" | "warning" | "select" = "light"
): void {
  const wa = getTelegramWebApp();
  if (!wa?.HapticFeedback) return;
  if (type === "success" || type === "error" || type === "warning") {
    wa.HapticFeedback.notificationOccurred(type);
  } else if (type === "select") {
    wa.HapticFeedback.selectionChanged();
  } else {
    wa.HapticFeedback.impactOccurred(type);
  }
}
