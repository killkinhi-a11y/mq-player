/**
 * Haptic feedback utility for mobile devices.
 * Uses navigator.vibrate — works on Android/Chrome. iOS Safari 17+ supports
 * it partially. No-op on desktop (vibrate is undefined).
 *
 * Patterns inspired by iOS haptic types:
 * - light: 10ms — subtle tap (like, toggle)
 * - medium: 20ms — medium impact (skip, play/pause)
 * - heavy: 40ms — heavy impact (dislike, delete)
 * - success: [10,30,10] — success pattern (added to playlist)
 * - warning: [20,40,20] — warning pattern (error)
 */

type HapticPattern = number | number[];

const PATTERNS = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 30, 10],
  warning: [20, 40, 20],
} as const;

export function haptic(type: keyof typeof PATTERNS = "light"): void {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[type] as HapticPattern);
  } catch {
    // Silent — haptics are best-effort
  }
}

// Convenience wrappers
export const hapticLike = () => haptic("success");
export const hapticDislike = () => haptic("heavy");
export const hapticSkip = () => haptic("medium");
export const hapticPlay = () => haptic("light");
