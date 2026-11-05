// Extracted from MessengerView.tsx (Stage III decomposition) — moved verbatim.
import { AVATAR_COLORS } from "./constants";
import { formatDuration as formatDurationCanonical } from "@/lib/musicApi";
import { simulateDecryptSync } from "@/lib/crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function formatLastSeen(iso: string | null): string {
  if (!iso) return "был(а) недавно";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "был(а) недавно";
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `был(а) ${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `был(а) ${diffH} ч назад`;
    return `был(а) ${d.toLocaleDateString("ru-RU")}`;
  } catch { return "был(а) недавно"; }
}

// v69: canonical formatter (guards + h:mm:ss) replaces the guarded local
// copy — one formatter everywhere.
export const formatDuration = formatDurationCanonical;

export function getDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const msgDay = new Date(d); msgDay.setHours(0, 0, 0, 0);
    if (msgDay.getTime() === today.getTime()) return "Сегодня";
    if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch { return ""; }
}

export function sameDay(a: string, b: string): boolean {
  try {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  } catch { return false; }
}

export function colorForId(id: string): string {
  let hash = 0;
  const s = id || "x";
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name ? name.replace("@", "").charAt(0).toUpperCase() : "?";
}

export function parseVoice(content: string): { voiceUrl: string; voiceDuration: number } | null {
  if (!content || typeof content !== "string") return null;
  try {
    const p = JSON.parse(content);
    if (p && typeof p.voiceUrl === "string") {
      return { voiceUrl: p.voiceUrl, voiceDuration: Number(p.voiceDuration) || 0 };
    }
  } catch {}
  return null;
}

export function decrypt(content: string): string {
  try { return simulateDecryptSync(content || ""); } catch { return content || ""; }
}
