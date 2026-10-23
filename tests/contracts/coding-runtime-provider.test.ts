import { expect, test } from "bun:test";

test("Python Submit provider selection in an isolated process", async () => {
  const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/coding/runtime-provider.ts"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(stdout + stderr).toContain("1 pass");
  expect(status).toBe(0);
});
