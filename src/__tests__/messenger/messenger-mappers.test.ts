import { describe, it, expect } from "vitest";
import { toGroupMembers } from "@/components/mq/messenger/mappers";

describe("toGroupMembers", () => {
  it("normalizes nested {userId, user:{username, avatar}} rows (id = userId)", () => {
    expect(toGroupMembers([{ id: "row1", userId: "u7", role: "admin", user: { username: "bob", avatar: "a.png" } }]))
      .toEqual([{ id: "u7", userId: "u7", username: "bob", avatar: "a.png", role: "admin" }]);
  });
  it("accepts flat rows and fills defaults", () => {
    expect(toGroupMembers([{ id: 5 }])).toEqual([{ id: "5", userId: "5", username: "Участник", avatar: undefined, role: "member" }]);
  });
  it("non-array → []", () => {
    expect(toGroupMembers(undefined)).toEqual([]);
    expect(toGroupMembers({})).toEqual([]);
  });
});
