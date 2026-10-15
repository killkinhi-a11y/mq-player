import type { Message as ChatMessage } from "@/lib/musicApi";

/**
 * DEMO CHAT SEED (v14 P0) — local, in-memory conversations for demo mode.
 *
 * Before this module the messenger in demo mode was a dead end
 * («В демо-режиме чаты недоступны») — the chat UI could not be reviewed
 * without a real account. The seed keeps the acceptance surface honest:
 *
 *  - 3 dialogs with last-message previews (Алиса / Марк / Нина)
 *  - 1 group chat («Ночной плейлист») so the Группы section is alive
 *  - the first DM thread opens pre-filled with 6 messages (bubbles,
 *    date separator, own-vs-other alignment) — enough to verify the
 *    reference layout end to end
 *  - everything lives ONLY in component memory (memory store): sending
 *    appends locally, nothing is persisted, no API is touched
 *
 * MQ entities only — no fake Marketplace/Massage content. Online
 * statuses are static demo values (Alice online, others recently seen).
 */

export interface DemoFriendUser {
  id: string;
  username: string;
  avatar?: string;
  addedAt: string;
}

export interface DemoGroupChat {
  id: string;
  name: string;
  avatar?: string;
  members: Array<{ id: string; username: string; avatar?: string; userId?: string; role?: string }>;
  createdAt: string;
  memberCount?: number;
  createdBy?: string;
}

export const DEMO_USER_ID = "demo-user-id";

export const DEMO_FRIENDS: DemoFriendUser[] = [
  { id: "demo-alice", username: "Алиса", addedAt: daysAgo(21) },
  { id: "demo-mark", username: "Марк", addedAt: daysAgo(14) },
  { id: "demo-nina", username: "Нина", addedAt: daysAgo(6) },
];

export const DEMO_ONLINE: Record<string, { online: boolean; lastSeen: string | null }> = {
  "demo-alice": { online: true, lastSeen: null },
  "demo-mark": { online: false, lastSeen: minutesAgo(34) },
  "demo-nina": { online: true, lastSeen: null },
};

export const DEMO_GROUP: DemoGroupChat = {
  id: "demo-group-night",
  name: "Ночной плейлист",
  members: [
    { id: "demo-alice", username: "Алиса", role: "member" },
    { id: "demo-mark", username: "Марк", role: "member" },
  ],
  memberCount: 3,
  createdBy: DEMO_USER_ID,
  createdAt: daysAgo(10),
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/** ChatMessage factory — plain (unencrypted) content passes through decrypt(). */
function msg(
  id: string, senderId: string, receiverId: string, text: string,
  minutesBack: number, senderName?: string,
): ChatMessage {
  return {
    id,
    content: text,
    senderId,
    receiverId,
    encrypted: false,
    createdAt: minutesAgo(minutesBack),
    senderName,
    messageType: "text",
  };
}

/** Threads keyed by the DM contact id (mirrors the sender/receiver filter). */
export function buildDemoThreads(): Record<string, ChatMessage[]> {
  return {
    "demo-alice": [
      msg("dm-al-1", "demo-alice", DEMO_USER_ID, "Слушала новый релиз INOHA — тот трек с волной в конце просто космос", 46, "Алиса"),
      msg("dm-al-2", DEMO_USER_ID, "demo-alice", "Да, Seventh Heaven уже у меня в избранном", 44),
      msg("dm-al-3", "demo-alice", DEMO_USER_ID, "Скинь потом свой плейлист, хочу сравнить", 41, "Алиса"),
      msg("dm-al-4", DEMO_USER_ID, "demo-alice", "Соберу вечером после работы", 39),
      msg("dm-al-5", "demo-alice", DEMO_USER_ID, "И попробуй WAVE-радио от любого трека — оно подбирает похожие само", 12, "Алиса"),
      msg("dm-al-6", DEMO_USER_ID, "demo-alice", "Вечером проверю, спасибо", 9),
    ],
    "demo-mark": [
      msg("dm-mk-1", "demo-mark", DEMO_USER_ID, "Го в «Ночной плейлист», мы там обсуждаем новый альбом", 125, "Марк"),
      msg("dm-mk-2", DEMO_USER_ID, "demo-mark", "Уже смотрю, спасибо за приглашение", 118),
    ],
    "demo-nina": [
      msg("dm-ni-1", "demo-nina", DEMO_USER_ID, "Спасибо за рекомендации! Слушаю весь день, ничего не могу поделать", 320, "Нина"),
    ],
    "demo-group-night": [
      msg("g-np-1", "demo-mark", DEMO_USER_ID, "Новый альбом вышел — обсуждаете?", 240, "Марк"),
      msg("g-np-2", DEMO_USER_ID, DEMO_USER_ID, "Слушаю прямо сейчас, вторая половина сильнее", 233),
    ],
  };
}

/** First DM to auto-open (per spec: 1 open thread with bubbles on entry). */
export const DEMO_DEFAULT_CHAT_ID = "demo-alice";
