import { createClient, type Client } from "@libsql/client";
import {
  assertStagingEnvironment,
  isAllowlistedStagingResource,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";

export async function countLegacyAdminsWithoutActiveGrant(client: Client): Promise<number> {
  const { rows } = await client.execute(`
    SELECT COUNT(*) AS count
    FROM user u
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
    const { databaseUrl } = assertStagingEnvironment({
      productionEnv: parseEnvFile(".env.prod"),
      requiredResources: ["database"],
    });
    if (!isAllowlistedStagingResource("database", databaseUrl)) {
      throw new Error("UNEXPECTED_STAGING_DATABASE");
    }
    const client = createClient(resolveDatabaseConnection());
    try {
      const legacyAdminsWithoutActiveCanonicalAdmin = await countLegacyAdminsWithoutActiveGrant(client);
      console.log(JSON.stringify({ legacyAdminsWithoutActiveCanonicalAdmin }));
    } finally {
      client.close();
    }
  } catch (error) {
    console.error(JSON.stringify(safeGuardError(error)));
    process.exitCode = 1;
  }
}
