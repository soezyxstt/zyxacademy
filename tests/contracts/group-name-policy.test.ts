import { describe, expect, it } from "bun:test";
import {
  GROUP_NAME_CHANGE_COOLDOWN_MS,
  getGroupNameChangePolicy,
  normalizeGroupName,
  validateGroupName,
} from "@/lib/groups/group-name-policy";

describe("group name change policy", () => {
  it("allows the first rename", () => {
    expect(getGroupNameChangePolicy(null, new Date("2026-09-10T00:00:00Z"))).toEqual({
      canRename: true,
      nextRenameAt: null,
      remainingMs: 0,
    });
  });

  it("blocks another rename before 30 full days pass", () => {
    const lastChangedAt = new Date("2026-09-01T10:00:00Z");
    const now = new Date("2026-09-10T10:00:00Z");
    const policy = getGroupNameChangePolicy(lastChangedAt, now);

    expect(policy.canRename).toBe(false);
    expect(policy.nextRenameAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(policy.remainingMs).toBe(21 * 24 * 60 * 60 * 1000);
  });

  it("allows a rename at exactly the 30-day boundary", () => {
    const lastChangedAt = new Date("2026-09-01T10:00:00Z");
    const now = new Date(lastChangedAt.getTime() + GROUP_NAME_CHANGE_COOLDOWN_MS);

    expect(getGroupNameChangePolicy(lastChangedAt, now).canRename).toBe(true);
  });

  it("normalizes whitespace and validates the display name", () => {
    expect(normalizeGroupName("  Mesin   A  ")).toBe("Mesin A");
    expect(validateGroupName("ab")).toBe("Nama kelompok minimal 3 karakter.");
    expect(validateGroupName("A".repeat(81))).toBe(
      "Nama kelompok maksimal 80 karakter.",
    );
    expect(validateGroupName("Kelompok Termo 1")).toBeNull();
  });
});
