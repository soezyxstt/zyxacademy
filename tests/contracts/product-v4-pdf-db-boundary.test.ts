import { expect, test } from "bun:test";

test("V4 PDF promotion exercises SQLite transactions in an isolated process", async () => {
  const child = Bun.spawn([process.execPath, "tests/fixtures/product-learning/pdf-promotion-db-boundary.ts"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env: { ...process.env, DATABASE_URL: "file::memory:", SKIP_ENV_VALIDATION: "1" } });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const result = JSON.parse(stdout.trim());
  expect(result.status).toBe("PASS");
  expect(result.boundaries).toContain("SQLite report CAS rollback");
  expect(result.boundaries).toContain("explicit retry recovery");
}, 60_000);
