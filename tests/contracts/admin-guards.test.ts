import { describe, expect, it } from "bun:test";

process.env.SKIP_ENV_VALIDATION ??= "1";
const { resolveRoleAuthorization } = await import("@/lib/auth/admin-guards");

describe("canonical-first admin guards", () => {
  it("uses an active canonical admin membership even when the legacy role disagrees", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: true,
      canonicalMembershipExists: true,
      canonicalRoleAllowed: true,
      legacyRole: "student",
      legacyRoles: ["admin"],
    })).toBe(true);
  });

  it("does not let a legacy admin role bypass a canonical non-admin membership", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: true,
      canonicalMembershipExists: true,
      canonicalRoleAllowed: false,
      legacyRole: "admin",
      legacyRoles: ["admin"],
    })).toBe(false);
  });

  it("does not let a legacy role bypass a canonical identity with no role membership", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: true,
      canonicalMembershipExists: false,
      canonicalRoleAllowed: false,
      legacyRole: "admin",
      legacyRoles: ["admin"],
    })).toBe(false);
  });

  it("does not use the legacy role when a canonical membership exists without an identity", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: false,
      canonicalMembershipExists: true,
      canonicalRoleAllowed: false,
      legacyRole: "admin",
      legacyRoles: ["admin"],
    })).toBe(false);
  });

  it("keeps legacy-role compatibility only when no canonical source exists", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: false,
      canonicalMembershipExists: false,
      canonicalRoleAllowed: false,
      legacyRole: "admin",
      legacyRoles: ["admin"],
    })).toBe(true);
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: false,
      canonicalMembershipExists: false,
      canonicalRoleAllowed: false,
      legacyRole: "teacher",
      legacyRoles: ["admin", "teacher"],
    })).toBe(true);
  });

  it("rejects unsupported or absent legacy roles", () => {
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: false,
      canonicalMembershipExists: false,
      canonicalRoleAllowed: false,
      legacyRole: "student",
      legacyRoles: ["admin", "teacher"],
    })).toBe(false);
    expect(resolveRoleAuthorization({
      canonicalIdentityExists: false,
      canonicalMembershipExists: false,
      canonicalRoleAllowed: false,
      legacyRole: null,
      legacyRoles: ["admin", "teacher"],
    })).toBe(false);
  });
});
