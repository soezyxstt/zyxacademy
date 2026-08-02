import { describe, expect, it } from "bun:test";
import { hasAnyPeranFromCodes, hasPeranFromCodes } from "@/lib/auth/authorization";

describe("Peran authorization contract", () => {
 it("allows an assigned tutor and rejects an unassigned murid", () => {
  expect(hasPeranFromCodes(["tutor"], "tutor")).toBe(true);
  expect(hasPeranFromCodes(["murid"], "tutor")).toBe(false);
  expect(hasAnyPeranFromCodes(["murid"], ["tutor"], { allowAdmin: true })).toBe(false);
 });

 it("keeps the existing admin override explicit", () => {
  expect(hasAnyPeranFromCodes(["admin"], ["tutor"], { allowAdmin: true })).toBe(true);
  expect(hasAnyPeranFromCodes(["admin"], ["tutor"])).toBe(false);
 });

 it("does not treat the chat speaker value student as a murid membership", () => {
  expect(hasPeranFromCodes(["student"], "murid")).toBe(false);
  expect(hasAnyPeranFromCodes(["student"], ["admin", "tutor", "murid"])).toBe(false);
 });
});
