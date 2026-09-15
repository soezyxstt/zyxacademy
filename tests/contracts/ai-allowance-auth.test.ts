import { describe, expect, it } from "bun:test";
import { resolveEffectiveRoleForActor, UsageBudgetService } from "@/lib/usage-budget-service";

describe("Plan 004 allowance role ownership", () => {
  it("resolves multi-role identities deterministically without accepting speaker roles", () => {
    expect(UsageBudgetService.resolveEffectiveRole(["murid"])).toBe("murid");
    expect(UsageBudgetService.resolveEffectiveRole(["murid", "tutor"])).toBe("tutor");
    expect(UsageBudgetService.resolveEffectiveRole(["murid", "tutor", "admin"])).toBe("admin");
    expect(UsageBudgetService.resolveEffectiveRole(["student" as never])).toBeNull();
  });

  it("does not expose an effective role for an empty or unknown membership", () => {
    expect(UsageBudgetService.resolveEffectiveRole([])).toBeNull();
    expect(UsageBudgetService.resolveEffectiveRole(["assistant" as never])).toBeNull();
  });

  it("requires a canonical identity before granting the allowance fallback", () => {
    expect(resolveEffectiveRoleForActor([], { identityStatus: "active", hasAuthUser: true })).toBe("murid");
    expect(resolveEffectiveRoleForActor([], { identityStatus: null, hasAuthUser: true })).toBeNull();
    expect(resolveEffectiveRoleForActor([], { identityStatus: "suspended", hasAuthUser: true })).toBeNull();
    expect(resolveEffectiveRoleForActor([], { identityStatus: null, hasAuthUser: false })).toBeNull();
  });
});
