import { expect, test } from "bun:test";

async function loadDatabase(databaseUrl: string, buildPlaceholder = "") {
  const child = Bun.spawn([process.execPath, "-e", 'await import("./lib/db/index.ts"); console.log("loaded")'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TURSO_DATABASE_URL: "libsql://ignored.example",
      ZYX_POSTGRES_BUILD_PLACEHOLDER: buildPlaceholder,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("Postgres configuration rejects missing or non-Postgres URLs without falling back to Turso", async () => {
  const missing = await loadDatabase("");
  expect(missing.exitCode).not.toBe(0);
  expect(missing.stderr).toContain("DATABASE_URL is required");

  const invalid = await loadDatabase("libsql://sensitive-example");
  expect(invalid.exitCode).not.toBe(0);
  expect(invalid.stderr).toContain("DATABASE_URL must be a PostgreSQL connection URL");
  expect(invalid.stderr).not.toContain("sensitive-example");

  const valid = await loadDatabase("postgresql://user:password@127.0.0.1:5432/test");
  expect(valid.exitCode).toBe(0);
  expect(valid.stdout).toContain("loaded");

  const placeholder = await loadDatabase("", "1");
  expect(placeholder.exitCode).toBe(0);
  expect(placeholder.stdout).toContain("loaded");
}, 60_000);
