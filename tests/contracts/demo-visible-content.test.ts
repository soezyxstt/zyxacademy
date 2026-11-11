import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("demo content bypasses scroll reveal without waiting for hydration", () => {
  const reveal = readFileSync("components/ui/reveal.tsx", "utf8");
  expect(reveal).toContain("if (isDemo || (isAdmin && mounted))");
  expect(reveal).toContain("if (isAdmin || isDemo)");
});
