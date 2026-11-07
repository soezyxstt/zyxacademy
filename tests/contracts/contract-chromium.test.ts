import { expect, test } from "bun:test";
import { contractChromiumPath } from "../helpers/chromium";

test("PDF contracts prefer pinned browser and can use the CI system Chrome", () => {
  expect(contractChromiumPath("/pinned", "", path => path === "/pinned")).toBe("/pinned");
  expect(contractChromiumPath("/absent", "", path => path === "/usr/bin/google-chrome")).toBe("/usr/bin/google-chrome");
});
test("an explicitly configured browser must exist and is never silently replaced", () => {
  expect(contractChromiumPath("/pinned", "/configured", path => path === "/configured")).toBe("/configured");
  expect(() => contractChromiumPath("/pinned", "/configured", path => path === "/pinned")).toThrow("Configured contract Chromium executable does not exist");
  expect(() => contractChromiumPath("/absent", "", () => false)).toThrow("Chromium is required");
});
