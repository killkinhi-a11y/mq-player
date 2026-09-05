/**
 * @vitest-environment node
 *
 * Task 1 — owner transfer (server-side).
 *
 * ensureOwnerAdminRole() must:
 *  - grant "admin" in the DB (persistent source of truth) for the project
 *    owner (@sss) when their role is not admin yet;
 *  - DEMOTE the former owner (@liluzipyzi) back to "user" when they still
 *    carry the admin role — owner rights must be fully removed;
 *  - leave non-owner users untouched (never auto-promote regular users);
 *  - never demote admins granted through the admin panel;
 *  - fail safe (previous role, no crash) when the DB update fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/database", () => ({
  database: {
    updateUser: vi.fn(async () => ({})),
  },
}));

import { database } from "@/lib/database";
import { ensureOwnerAdminRole, isOwnerUsername, isFormerOwnerUsername } from "@/lib/admin-grant";

const updateUserMock = database.updateUser as ReturnType<typeof vi.fn>;

describe("ensureOwnerAdminRole (server-side owner transfer → @sss)", () => {
  beforeEach(() => {
    updateUserMock.mockClear().mockResolvedValue({});
    delete process.env.ADMIN_USERNAMES;
    delete process.env.FORMER_ADMIN_USERNAMES;
  });

  afterEach(() => {
    delete process.env.ADMIN_USERNAMES;
    delete process.env.FORMER_ADMIN_USERNAMES;
  });

  it("promotes the project owner (@sss) to admin and persists it in the DB", async () => {
    const role = await ensureOwnerAdminRole({ id: "u1", username: "sss", role: "user" });
    expect(role).toBe("admin");
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith("u1", { role: "admin" });
  });

  it("is case-insensitive on the owner username", async () => {
    const role = await ensureOwnerAdminRole({ id: "u2", username: "Sss", role: "user" });
    expect(role).toBe("admin");
    expect(updateUserMock).toHaveBeenCalledWith("u2", { role: "admin" });
  });

  it("FORMER OWNER → NO OWNER: @liluzipyzi is no longer an owner username", () => {
    expect(isOwnerUsername("liluzipyzi")).toBe(false);
    expect(isOwnerUsername("Liluzipyzi")).toBe(false);
    expect(isFormerOwnerUsername("liluzipyzi")).toBe(true);
  });

  it("OLD OWNER → demoted from admin to user (DB write, owner fully removed)", async () => {
    const role = await ensureOwnerAdminRole({ id: "u4", username: "liluzipyzi", role: "admin" });
    expect(role).toBe("user");
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith("u4", { role: "user" });
  });

  it("old owner already demoted stays a regular user (no DB write)", async () => {
    const role = await ensureOwnerAdminRole({ id: "u9", username: "liluzipyzi", role: "user" });
    expect(role).toBe("user");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("@sss → owner: isOwnerUsername true, admin role is idempotent (no DB write)", async () => {
    expect(isOwnerUsername("sss")).toBe(true);
    const role = await ensureOwnerAdminRole({ id: "u10", username: "sss", role: "admin" });
    expect(role).toBe("admin");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("never promotes a regular user", async () => {
    const role = await ensureOwnerAdminRole({ id: "u3", username: "regularuser", role: "user" });
    expect(role).toBe("user");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("keeps admins granted via the admin panel even outside the owner list", async () => {
    const role = await ensureOwnerAdminRole({ id: "u5", username: "someoneelse", role: "admin" });
    expect(role).toBe("admin");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("promotion fails safe (previous role, no crash) when the DB update throws", async () => {
    updateUserMock.mockRejectedValueOnce(new Error("db down"));
    const role = await ensureOwnerAdminRole({ id: "u6", username: "sss", role: "user" });
    expect(role).toBe("user");
  });

  it("demotion fails SECURE (reports 'user') when the DB update throws", async () => {
    updateUserMock.mockRejectedValueOnce(new Error("db down"));
    const role = await ensureOwnerAdminRole({ id: "u11", username: "liluzipyzi", role: "admin" });
    expect(role).toBe("user");
  });

  it("honors the ADMIN_USERNAMES env override (env wins over built-in lists)", async () => {
    process.env.ADMIN_USERNAMES = "alice, Bob";
    expect(isOwnerUsername("alice")).toBe(true);
    expect(isOwnerUsername("bob")).toBe(true);
    expect(isOwnerUsername("sss")).toBe(false);
    const role = await ensureOwnerAdminRole({ id: "u7", username: "bob", role: "user" });
    expect(role).toBe("admin");
  });

  it("a former owner re-added via ADMIN_USERNAMES env is NOT demoted (current list wins)", async () => {
    process.env.ADMIN_USERNAMES = "liluzipyzi";
    const role = await ensureOwnerAdminRole({ id: "u12", username: "liluzipyzi", role: "admin" });
    expect(role).toBe("admin");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("FORMER_ADMIN_USERNAMES env appends to the demotion list", async () => {
    process.env.FORMER_ADMIN_USERNAMES = "oldcoowner";
    expect(isFormerOwnerUsername("oldcoowner")).toBe(true);
    const role = await ensureOwnerAdminRole({ id: "u13", username: "oldcoowner", role: "admin" });
    expect(role).toBe("user");
    expect(updateUserMock).toHaveBeenCalledWith("u13", { role: "user" });
  });

  it("ignores empty/missing usernames", async () => {
    expect(isOwnerUsername(null)).toBe(false);
    expect(isOwnerUsername("")).toBe(false);
    const role = await ensureOwnerAdminRole({ id: "u8", username: undefined, role: "user" });
    expect(role).toBe("user");
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
