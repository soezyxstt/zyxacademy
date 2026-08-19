import { describe, expect, it } from "bun:test";
import {
 membershipIdFor,
 mapLegacyRole,
 normalizePeranCodes,
 PERAN_IDS,
 PERAN_SEEDS,
} from "@/lib/auth/peran";
import { hasAnyPeranFromCodes, hasPeranFromCodes } from "@/lib/auth/authorization";

describe("Peran mapping contract", () => {
 it("maps every supported legacy access role without guessing unknown values", () => {
  expect(mapLegacyRole("admin")).toBe("admin");
  expect(mapLegacyRole("teacher")).toBe("tutor");
  expect(mapLegacyRole("student")).toBe("murid");
  expect(mapLegacyRole(null)).toBeNull();
  expect(mapLegacyRole("owner")).toBeNull();
 });

 it("keeps stable role ids and deterministic membership ids", () => {
  expect(PERAN_SEEDS).toEqual([
   { id: PERAN_IDS.admin, code: "admin" },
   { id: PERAN_IDS.tutor, code: "tutor" },
   { id: PERAN_IDS.murid, code: "murid" },
  ]);
  expect(membershipIdFor("user-1", "tutor")).toBe(membershipIdFor("user-1", "tutor"));
  expect(membershipIdFor("user-1", "tutor")).not.toBe(membershipIdFor("user-1", "murid"));
 });

 it("supports multiple memberships and ignores unknown codes", () => {
  expect(normalizePeranCodes(["tutor", "murid", "unknown", "tutor"])).toEqual(["tutor", "murid"]);
  expect(hasPeranFromCodes(["tutor", "murid"], "tutor")).toBe(true);
  expect(hasPeranFromCodes(["murid"], "tutor")).toBe(false);
  expect(hasPeranFromCodes(["admin"], "tutor", { allowAdmin: true })).toBe(true);
  expect(hasPeranFromCodes(["admin"], "tutor")).toBe(false);
  expect(hasAnyPeranFromCodes(["tutor", "murid"], ["tutor", "admin"])).toBe(true);
  expect(hasAnyPeranFromCodes(["murid"], ["tutor", "admin"], { allowAdmin: true })).toBe(false);
 });
});
