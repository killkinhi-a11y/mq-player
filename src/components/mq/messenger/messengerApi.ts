// Messenger API service layer (extracted from MessengerView.tsx in Stage III; bodies moved verbatim).
import type { FriendUser, FriendsLoadResult, GroupChat, OnlineStatus } from "./types";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";
import { useAppStore } from "@/store/useAppStore";

/** Friends list with up to 2 retries (2s apart) for transient DB errors. */
export async function loadMessengerFriends(userId: string | null | undefined): Promise<FriendsLoadResult> {
  // Phase 2C: gated — demo sessions use local friends, no 401 + retry.
  if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return { status: "skip" };
  if (!userId) return { status: "skip" };
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (res.status === 401) {
        // Auth loss: no auto-retry (that would be the 401→retry→401 loop).
        controlled401Recovery("messenger/friends");
        return { status: "skip" };
      }
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      return { status: "ok", friends: Array.isArray(data.friends) ? data.friends : [] };
    } catch {
      // Auto-retry after 2s (handles transient Turso connection issues)
      if (attempt >= 2) return { status: "error" };
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function loadGroupChats(userId: string | null | undefined): Promise<GroupChat[] | null> {
  // Phase 2C: gated — demo sessions have no server-side group chats.
  if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return null;
  if (!userId) return null;
  try {
    const res = await fetch(`/api/group-chats?userId=${userId}`);
    if (res.status === 401) { controlled401Recovery("group-chats"); return null; }
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data.groupChats) ? data.groupChats : Array.isArray(data) ? data : [];
    return list.map((g: any) => ({
      id: g.id, name: g.name || "Group", avatar: g.avatar,
      // List API has no members array — but it has the true DB count.
      members: Array.isArray(g.members) ? g.members : [],
      memberCount: Number(g.memberCount ?? (Array.isArray(g.members) ? g.members.length : 0)),
      createdBy: g.createdBy,
      createdAt: g.createdAt || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

/** Online status of each friend (GET /api/user/:id/status). Failed lookups → offline. */
export async function fetchOnlineStatuses(friends: FriendUser[]): Promise<Record<string, OnlineStatus>> {
  const statuses: Record<string, OnlineStatus> = {};
  await Promise.all(friends.map(async (f) => {
    try {
      const res = await fetch(`/api/user/${f.id}/status`);
      if (res.status === 401) {
        controlled401Recovery("user/status");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        statuses[f.id] = { online: !!data.online, lastSeen: data.lastSeen ?? null };
      } else {
        statuses[f.id] = { online: false, lastSeen: null };
      }
    } catch { statuses[f.id] = { online: false, lastSeen: null }; }
  }));
  return statuses;
}
