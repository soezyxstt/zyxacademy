import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("coding chat persistence owns one replay-safe turn in an isolated process", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zyra-history-"));
  try {
    const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/zyra/coding-chat-history.ts", "./tests/fixtures/zyra/history-replay.ts"], { cwd: process.cwd(), env: { ...process.env, ZYRA_HISTORY_TEST_DB: join(directory, "history.db") }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (status !== 0) console.error(stdout + stderr);
    expect(status).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 20_000);
