import { describe, expect, test } from "bun:test";
import { canViewPersonalZyraUsage, canViewZyraOps } from "@/lib/zyra/ops";

describe("Zyra ops authorization", () => {
  test("restricts global operations to admins", () => {
    expect(canViewZyraOps("admin")).toBe(true);
    expect(canViewZyraOps("tutor")).toBe(false);
    expect(canViewZyraOps("murid")).toBe(false);
  });
  test("keeps personal usage scoped", () => {
    expect(canViewPersonalZyraUsage({ actorId: "a", ownerId: "a", role: "murid" })).toBe(true);
    expect(canViewPersonalZyraUsage({ actorId: "b", ownerId: "a", role: "murid" })).toBe(false);
  });
});
