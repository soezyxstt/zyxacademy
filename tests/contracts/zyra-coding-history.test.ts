import { expect, test } from "bun:test";

test("coding chat persistence owns one replay-safe turn in an isolated process", async () => {
  const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/zyra/coding-chat-history.ts", "./tests/fixtures/zyra/history-replay.ts"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (status !== 0) console.error(stdout + stderr);
  expect(status).toBe(0);
}, 180_000);
