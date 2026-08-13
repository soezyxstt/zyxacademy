import { describe, expect, test } from "bun:test";
import { isPersonalizationScopeOwned } from "@/lib/zyra/personalization/access";

describe("Zyra personalization ownership boundary", () => {
  test("allows the actor's own profile scope", () => {
    expect(isPersonalizationScopeOwned("murid-a", "murid-a")).toBe(true);
  });

  test("rejects a different learner profile scope", () => {
    expect(isPersonalizationScopeOwned("murid-a", "murid-b")).toBe(false);
  });

  test("never treats an absent actor as an owner", () => {
    expect(isPersonalizationScopeOwned(null, "murid-a")).toBe(false);
    expect(isPersonalizationScopeOwned("murid-a", null)).toBe(false);
  });
});
