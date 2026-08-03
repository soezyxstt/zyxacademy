import { describe, expect, it } from "bun:test";
import { hasAnyPeranFromCodes, hasPeranFromCodes } from "@/lib/auth/authorization";

describe("Plan 014 authorization matrix", () => {
  it("keeps admin, tutor, and murid memberships independent", () => {
    expect(hasPeranFromCodes(["tutor", "murid"], "tutor")).toBe(true);
    expect(hasPeranFromCodes(["tutor", "murid"], "murid")).toBe(true);
    expect(hasPeranFromCodes(["tutor", "murid"], "admin")).toBe(false);
  });

  it("uses explicit admin override only when requested", () => {
    expect(hasAnyPeranFromCodes(["admin"], ["tutor"], { allowAdmin: true })).toBe(true);
    expect(hasAnyPeranFromCodes(["admin"], ["tutor"])).toBe(false);
    expect(hasAnyPeranFromCodes(["student"], ["murid"], { allowAdmin: true })).toBe(false);
  });
});
