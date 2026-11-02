import assert from "node:assert/strict";
import { Client } from "pg";
import { assertTarget } from "@/scripts/neon/import-core";

export async function countLegacyAdminsWithoutActiveGrant(client: { query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }): Promise<number> {
  const { rows } = await client.query(`
    SELECT COUNT(*) AS count
    FROM "user" u
    WHERE u.role = 'admin' AND NOT EXISTS (
      SELECT 1
      FROM pengguna p
      JOIN pengguna_peran pp ON pp.pengguna_id = p.id
      JOIN peran r ON r.id = pp.peran_id
      WHERE p.id = u.id AND p.status = 'active' AND r.code = 'admin'
    )
  `);
  return Number(rows[0].count);
}

if (import.meta.main) {
  try {
    assert.equal(process.env.ZYX_ENVIRONMENT, "staging");
    const databaseUrl = process.env.DATABASE_URL || "";
    assertTarget(databaseUrl, process.env.NEON_EXPECTED_HOST || "", "neondb");
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const identity = await client.query("SELECT current_setting('neon.branch_id', true) AS branch");
      assert.equal(identity.rows[0].branch, "br-gentle-scene-azq0gp91");
      const legacyAdminsWithoutActiveCanonicalAdmin = await countLegacyAdminsWithoutActiveGrant(client);
      console.log(JSON.stringify({ legacyAdminsWithoutActiveCanonicalAdmin }));
    } finally {
      await client.end();
    }
  } catch {
    console.error(JSON.stringify({ code: "STAGING_ADMIN_ROLE_AUDIT_FAILED" }));
    process.exitCode = 1;
  }
}
