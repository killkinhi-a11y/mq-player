// Extracted from AuthView.tsx (Stage III decomposition) — moved verbatim.

export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export const USERNAME_LENGTH_MIN = 2;

export const USERNAME_LENGTH_MAX = 20;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Human-readable messages for OAuth redirect error codes
// (set by /api/auth/google/callback and /api/auth/telegram-widget/callback)
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Вход через Google ещё не настроен. Обратитесь к администратору.",
  google_cancelled: "Вход через Google отменён.",
  invalid_state: "Проверка безопасности не пройдена. Попробуйте войти снова.",
  missing_code: "Google не передал код авторизации. Попробуйте снова.",
  google_exchange_failed: "Не удалось завершить вход через Google. Попробуйте позже.",
  google_token_invalid: "Данные Google не прошли проверку. Попробуйте снова.",
  google_failed: "Ошибка входа через Google. Попробуйте позже.",
  telegram_hash_invalid: "Не удалось подтвердить данные Telegram. Попробуйте снова.",
  telegram_failed: "Ошибка входа через Telegram. Попробуйте позже.",
  blocked: "Аккаунт заблокирован.",
  maintenance: "Проводятся технические работы. Вход временно недоступен.",
  account_missing: "Аккаунт не найден. Обратитесь в поддержку.",
};
