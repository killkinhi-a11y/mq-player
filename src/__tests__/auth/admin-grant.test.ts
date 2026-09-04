/**
 * @vitest-environment node
 *
 * Task 1 — owner admin bootstrap (server-side).
 *
 * ensureOwnerAdminRole() must:
 *  - grant "admin" in the DB (persistent source of truth) for the project
 *    owner (@liluzipyzi) when their role is not admin yet;
 *  - leave non-owner users untouched (never auto-promote regular users);
 *  - never DEMOTE an existing admin (the admin panel's grants are safe);
 *  - fail safe (keep previous role) when the DB update fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/database", () => ({
  database: {
    updateUser: vi.fn(async () => ({})),
  },
}));

import { database } from "@/lib/database";
import { ensureOwnerAdminRole, isOwnerUsername } from "@/lib/admin-grant";

const updateUserMock = database.updateUser as ReturnType<typeof vi.fn>;

describe("ensureOwnerAdminRole (server-side owner bootstrap)", () => {
  beforeEach(() => {
    updateUserMock.mockClear().mockResolvedValue({});
    delete process.env.ADMIN_USERNAMES;
  });

  afterEach(() => {
    delete process.env.ADMIN_USERNAMES;
  });

  it("promotes the project owner to admin and persists it in the DB", async () => {
    const role = await ensureOwnerAdminRole({ id: "u1", username: "liluzipyzi", role: "user" });
    expect(role).toBe("admin");
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith("u1", { role: "admin" });
  });

  it("is case-insensitive on the owner username", async () => {
    const role = await ensureOwnerAdminRole({ id: "u2", username: "Liluzipyzi", role: "user" });
    expect(role).toBe("admin");
    expect(updateUserMock).toHaveBeenCalledWith("u2", { role: "admin" });
  });

  it("never promotes a regular user", async () => {
    const role = await ensureOwnerAdminRole({ id: "u3", username: "regularuser", role: "user" });
    expect(role).toBe("user");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("never demotes an existing admin (idempotent, no DB write)", async () => {
    const role = await ensureOwnerAdminRole({ id: "u4", username: "liluzipyzi", role: "admin" });
    expect(role).toBe("admin");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("keeps admins granted via the admin panel even outside the owner list", async () => {
    const role = await ensureOwnerAdminRole({ id: "u5", username: "someoneelse", role: "admin" });
    expect(role).toBe("admin");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("fails safe (previous role, no crash) when the DB update throws", async () => {
    updateUserMock.mockRejectedValueOnce(new Error("db down"));
    const role = await ensureOwnerAdminRole({ id: "u6", username: "liluzipyzi", role: "user" });
    expect(role).toBe("user");
  });

  it("honors the ADMIN_USERNAMES env override", async () => {
    process.env.ADMIN_USERNAMES = "alice, Bob";
    expect(isOwnerUsername("alice")).toBe(true);
    expect(isOwnerUsername("bob")).toBe(true);
    expect(isOwnerUsername("liluzipyzi")).toBe(false);
    const role = await ensureOwnerAdminRole({ id: "u7", username: "bob", role: "user" });
    expect(role).toBe("admin");
  });

  it("ignores empty/missing usernames", async () => {
    expect(isOwnerUsername(null)).toBe(false);
    expect(isOwnerUsername("")).toBe(false);
    const role = await ensureOwnerAdminRole({ id: "u8", username: undefined, role: "user" });
    expect(role).toBe("user");
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
