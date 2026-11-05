// Extracted from MessengerView.tsx (Stage III decomposition) — moved verbatim.

// ─── Types ────────────────────────────────────────────────────────────────

export interface FriendUser { id: string; username: string; avatar?: string; addedAt: string; }

export interface OnlineStatus { online: boolean; lastSeen: string | null; }

export interface GroupMember { id: string; username: string; avatar?: string; userId?: string; role?: string; }

export interface GroupChat {
  id: string; name: string; avatar?: string; members: GroupMember[]; createdAt: string;
  /** Count from the list API (owner included) — filled before the detail load. */
  memberCount?: number;
  createdBy?: string;
}

export interface ContextMenuState { id: string; x: number; y: number; }

// ─── Main Component ───────────────────────────────────────────────────────

export type FriendsLoadResult =
  | { status: "ok"; friends: any[] }
  | { status: "skip" }
  | { status: "error" };
