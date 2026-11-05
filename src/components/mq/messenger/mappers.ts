// Shared row mappers for the messenger (pure, unit-tested).
import type { GroupMember } from "./types";

/** Group member rows from GET /api/group-chats/[id] and POST /api/group-chats
 *  ({userId, role, user:{username, avatar}} or flat) → GroupMember (id = userId). */
export function toGroupMembers(rows: any): GroupMember[] {
  return Array.isArray(rows) ? rows.map((m: any) => ({
    id: String(m.userId ?? m.id ?? ""),
    userId: String(m.userId ?? m.id ?? ""),
    username: String(m.user?.username ?? m.username ?? "Участник"),
    avatar: m.user?.avatar ?? m.avatar,
    role: String(m.role ?? "member"),
  })) : [];
}
