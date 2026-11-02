import { expect, test } from "bun:test";

// HTTP fixtures replace auth/database/runtime modules. Isolate those mocks from
// the rest of the suite, particularly the real Python runtime tests.
test("authenticated coding HTTP contracts in an isolated process", async () => {
  const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/coding/http-contract.ts"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exitCode !== 0) throw new Error(`${stdout}\n${stderr}`);
  expect(`${stdout}\n${stderr}`).toContain("5 pass");
  expect(exitCode).toBe(0);
}, 180_000);
