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

interface CliOptions {
  email: string;
  targetEnv: "staging" | "prod" | "local";
  isApply: boolean;
  keepExistingRoles: boolean;
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.includes("@"));
  const email = emailArg || "soezyxstt@gmail.com";

  let targetEnv: "staging" | "prod" | "local" = "staging";
  for (const arg of args) {
    if (arg === "--prod" || arg === "--env=prod") targetEnv = "prod";
    if (arg === "--staging" || arg === "--env=staging") targetEnv = "staging";
    if (arg === "--local" || arg === "--env=local") targetEnv = "local";
  }

  const isApply = args.includes("--apply");
  const keepExistingRoles = !args.includes("--replace");

  return { email, targetEnv, isApply, keepExistingRoles };
}

async function main() {
  const { email, targetEnv, isApply, keepExistingRoles } = parseCli();

  const rootDir = process.cwd();
  let url: string | undefined;
  let authToken: string | undefined;

  if (targetEnv === "local") {
    url = "file:dev.db";
  } else if (targetEnv === "staging") {
    const env = parseEnvFile(join(rootDir, ".env.staging"));
    url = env.TURSO_DATABASE_URL || env.TURSO_CONNECTION_URL || env.DATABASE_URL;
    authToken = env.TURSO_AUTH_TOKEN;
  } else if (targetEnv === "prod") {
    const env = parseEnvFile(join(rootDir, ".env.prod"));
    url = env.TURSO_DATABASE_URL || env.TURSO_CONNECTION_URL || env.DATABASE_URL;
    authToken = env.TURSO_AUTH_TOKEN;
  }

  if (!url) {
    console.error(`[ERROR] Database connection URL not found for environment: ${targetEnv}`);
    process.exit(1);
  }

  const maskedUrl = url.replace(/\/\/.*@/, "//***@");
  console.log(`[Target Environment] ${targetEnv.toUpperCase()}`);
  console.log(`[Target Host] ${maskedUrl}`);
  console.log(`[Target Email] ${email}`);
  console.log(`[Mode] ${isApply ? "APPLY (write)" : "DRY-RUN (read-only)"}`);
  console.log(`[Keep Existing Roles] ${keepExistingRoles}\n`);

  const client = createClient({ url, authToken });

  try {
    // 1. Inspect current state
    const userRes = await client.execute({
      sql: "SELECT id, name, email, role, created_at, updated_at FROM user WHERE LOWER(email) = LOWER(?) LIMIT 1",
      args: [email],
    });

    if (userRes.rows.length === 0) {
      console.error(`[ERROR] User with email "${email}" not found in ${targetEnv} database.`);
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

    const alreadyHasTutor = membershipsRes.rows.some(
      (r) => r.peran_id === PERAN_IDS.tutor || r.code === "tutor"
    );

    if (alreadyHasTutor && penggunaRes.rows[0]?.status === "active") {
      console.log(`\n[INFO] User ${email} already has an active tutor role in ${targetEnv}.`);
      if (!isApply) {
        console.log("No changes needed. Verification succeeded.");
        return;
      }
    }

    if (!isApply) {
      console.log("\n[DRY-RUN complete] To apply changes to the database, rerun with --apply");
      return;
    }

    // 2. Perform write mutation
    console.log("\n=== APPLYING CHANGES ===");
    const now = Date.now();

    // 2a. Ensure peran 'tutor' exists
    await client.execute({
      sql: "INSERT OR IGNORE INTO peran (id, code, created_at) VALUES (?, ?, ?)",
      args: [PERAN_IDS.tutor, "tutor", now],
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

    // 2c. If replace mode requested, clear existing roles
    if (!keepExistingRoles) {
      await client.execute({
        sql: "DELETE FROM pengguna_peran WHERE pengguna_id = ?",
        args: [userId],
      });
      console.log("Cleared existing roles from 'pengguna_peran'");
    }

    // 2d. Ensure pengguna_peran has peran-tutor
    const membershipId = membershipIdFor(userId, "tutor");
    const hasTutorMembership = membershipsRes.rows.some(
      (r) => r.peran_id === PERAN_IDS.tutor || r.code === "tutor"
    );
    if (!hasTutorMembership || !keepExistingRoles) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO pengguna_peran (id, pengguna_id, peran_id, source, created_at) VALUES (?, ?, ?, 'grant_tutor_script', ?)",
        args: [membershipId, userId, PERAN_IDS.tutor, now],
      });
      console.log(`Inserted tutor membership (${membershipId}) into 'pengguna_peran'`);
    }

    // 2e. Synchronize legacy user.role if needed (do not downgrade admin)
    if (targetUser.role !== "admin" && targetUser.role !== "teacher") {
      await client.execute({
        sql: "UPDATE user SET role = 'teacher', updated_at = ? WHERE id = ?",
        args: [now, userId],
      });
      console.log("Updated 'user.role' to 'teacher'");
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

    const isTutorValid =
      afterPengguna.rows[0]?.status === "active" &&
      afterMemberships.rows.some((r) => r.code === "tutor" || r.peran_id === PERAN_IDS.tutor);

    if (isTutorValid) {
      console.log("\n[SUCCESS] User successfully verified as active tutor!");
    } else {
      console.error("\n[ERROR] Tutor verification check failed.");
      process.exit(1);
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
