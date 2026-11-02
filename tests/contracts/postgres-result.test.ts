import { expect, test } from "bun:test";
import { parsePostgresNumber } from "@/lib/db/postgres-result";

test("PostgreSQL numbers preserve safe aggregate values and reject unsafe values", () => {
  for (const [input, output] of [["0", 0], ["42", 42], ["-3.125", -3.125], ["9007199254740991", Number.MAX_SAFE_INTEGER]] as const) {
    expect(parsePostgresNumber(input)).toBe(output);
  }
  for (const input of ["9007199254740992", "-9007199254740992", "9007199254740991.1", "NaN", "Infinity", "-Infinity"]) {
    expect(() => parsePostgresNumber(input)).toThrow();
  }
});

test("Drizzle query parsers use the registered numeric conversions", async () => {
  const script = `
    import assert from "node:assert/strict";
    import { Pool } from "pg";
    import { sql } from "drizzle-orm";
    import { drizzle } from "drizzle-orm/node-postgres";
    import { user } from "./db/schema";
    const pool = new Pool({ connectionString: "postgresql://user:password@127.0.0.1:5432/test" });
    const before = drizzle(pool).select({ count: sql\`count(*)\` }).from(user).prepare("before");
    const getOriginal = Reflect.get(before, "queryConfig").types.getTypeParser;
    const int4 = getOriginal(23, "text");
    const binary = getOriginal(20, "binary");
    const { db } = await import("./lib/db");
    const query = db.select({ count: sql\`count(*)\` }).from(user).prepare("parser_test");
    for (const name of ["queryConfig", "rawQueryConfig"]) {
      const getParser = Reflect.get(query, name).types.getTypeParser;
      assert.equal(getParser(20, "text")("2"), 2);
      assert.equal(getParser(1700, "text")("1.5"), 1.5);
      assert.equal(getParser(23, "text"), int4);
      assert.equal(getParser(20, "binary"), binary);
    }
    await pool.end();
    await db.$client.end();
  `;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/test" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
}, 60_000);
