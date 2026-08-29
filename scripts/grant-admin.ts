import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { membershipIdFor, PERAN_IDS } from "@/lib/auth/peran";

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

async function main() {
  const email = process.argv.find((arg) => arg.includes("@")) || "soezyxst@gmail.com";
  const isApply = process.argv.includes("--apply");

  const rootDir = process.cwd();
  const envProd = parseEnvFile(join(rootDir, ".env.prod"));

  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_CONNECTION_URL ||
    envProd.TURSO_DATABASE_URL ||
    envProd.TURSO_CONNECTION_URL ||
    (envProd.DATABASE_URL && !envProd.DATABASE_URL.startsWith("postgres") ? envProd.DATABASE_URL : undefined);

  const authToken = process.env.TURSO_AUTH_TOKEN || envProd.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error("Error: TURSO_DATABASE_URL / TURSO_CONNECTION_URL not found in .env.prod or environment.");
    process.exit(1);
  }

  // Safe host display (no credentials)
  const maskedUrl = url.replace(/\/\/.*@/, "//***@");
  console.log(`[DB] Target Host: ${maskedUrl}`);
  console.log(`[User] Target Email: ${email}`);
  console.log(`[Mode] ${isApply ? "APPLY (write)" : "DRY-RUN (read-only)"}\n`);

  const client = createClient({ url, authToken });

  try {
    // 1. Inspect current state
    const userRes = await client.execute({
      sql: "SELECT id, name, email, role, created_at, updated_at FROM user WHERE LOWER(email) = LOWER(?) LIMIT 1",
      args: [email],
    });

    if (userRes.rows.length === 0) {
      console.error(`Error: User with email "${email}" not found in database.`);
      process.exit(1);
    }

    const targetUser = userRes.rows[0];
    const userId = String(targetUser.id);
    console.log("=== BEFORE STATE ===");
    console.log("user:", targetUser);

    const penggunaRes = await client.execute({
      sql: "SELECT id, status, created_at, updated_at FROM pengguna WHERE id = ?",
      args: [userId],
    });
    console.log("pengguna:", penggunaRes.rows[0] ?? null);

    const membershipsRes = await client.execute({
      sql: `SELECT pp.id, pp.pengguna_id, pp.peran_id, pp.source, p.code 
            FROM pengguna_peran pp 
            LEFT JOIN peran p ON pp.peran_id = p.id 
            WHERE pp.pengguna_id = ?`,
      args: [userId],
    });
    console.log("pengguna_peran memberships:", membershipsRes.rows);

    if (!isApply) {
      console.log("\n[DRY-RUN complete] To apply changes, rerun with --apply");
      return;
    }

    // 2. Perform write mutation
    console.log("\n=== APPLYING CHANGES ===");
    const now = Date.now();

    // 2a. Ensure peran 'admin' exists
    await client.execute({
      sql: "INSERT OR IGNORE INTO peran (id, code, created_at) VALUES (?, ?, ?)",
      args: [PERAN_IDS.admin, "admin", now],
    });

    // 2b. Ensure pengguna identity exists and is active
    if (penggunaRes.rows.length === 0) {
      await client.execute({
        sql: "INSERT INTO pengguna (id, status, created_at, updated_at) VALUES (?, 'active', ?, ?)",
        args: [userId, now, now],
      });
      console.log("Inserted new active row into 'pengguna'");
    } else if (penggunaRes.rows[0].status !== "active") {
      await client.execute({
        sql: "UPDATE pengguna SET status = 'active', updated_at = ? WHERE id = ?",
        args: [now, userId],
      });
      console.log("Updated 'pengguna' status to 'active'");
    }

    // 2c. Ensure pengguna_peran has peran-admin
    const membershipId = membershipIdFor(userId, "admin");
    const hasAdminMembership = membershipsRes.rows.some((r) => r.peran_id === PERAN_IDS.admin || r.code === "admin");
    if (!hasAdminMembership) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO pengguna_peran (id, pengguna_id, peran_id, source, created_at) VALUES (?, ?, ?, 'admin_grant', ?)",
        args: [membershipId, userId, PERAN_IDS.admin, now],
      });
      console.log(`Inserted admin membership (${membershipId}) into 'pengguna_peran'`);
    }

    // 2d. Sync user.role column as compatibility
    if (targetUser.role !== "admin") {
      await client.execute({
        sql: "UPDATE user SET role = 'admin', updated_at = ? WHERE id = ?",
        args: [now, userId],
      });
      console.log("Updated 'user.role' to 'admin'");
    }

    // 3. Inspect after state
    console.log("\n=== AFTER STATE ===");
    const afterUser = await client.execute({
      sql: "SELECT id, name, email, role FROM user WHERE id = ?",
      args: [userId],
    });
    console.log("user:", afterUser.rows[0]);

    const afterPengguna = await client.execute({
      sql: "SELECT id, status FROM pengguna WHERE id = ?",
      args: [userId],
    });
    console.log("pengguna:", afterPengguna.rows[0]);

    const afterMemberships = await client.execute({
      sql: `SELECT pp.id, pp.pengguna_id, pp.peran_id, pp.source, p.code 
            FROM pengguna_peran pp 
            LEFT JOIN peran p ON pp.peran_id = p.id 
            WHERE pp.pengguna_id = ?`,
      args: [userId],
    });
    console.log("pengguna_peran memberships:", afterMemberships.rows);

    const isAdminValid = afterPengguna.rows[0]?.status === "active" &&
      afterMemberships.rows.some((r) => r.code === "admin" || r.peran_id === PERAN_IDS.admin);

    if (isAdminValid) {
      console.log("\n[SUCCESS] User successfully verified as active admin!");
    } else {
      console.error("\n[ERROR] Admin verification check failed.");
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
