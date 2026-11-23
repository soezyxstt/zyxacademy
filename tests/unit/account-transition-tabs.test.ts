import { expect, test } from "bun:test";

test("cross-tab account transition pauses and refreshes the correct document", async () => {
  // The fixture intentionally ends in a pending reload. Isolate that module
  // state and browser globals from the other lifecycle tests.
  const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/auth/account-transition-tabs.ts"], {
    cwd: process.cwd(), stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
});
