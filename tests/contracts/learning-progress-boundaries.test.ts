import { expect, test } from "bun:test";

test("article progress and flashcard actions enforce account and revision boundaries", async () => {
  const child = Bun.spawn([process.execPath, "test", "./tests/fixtures/learning/progress-boundaries.ts"], {
    cwd: process.cwd(), stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30_000);
