import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { parseEnvFile } from "@/lib/staging/staging-guard";

async function main() {
  const env = parseEnvFile(".env.staging");
  const url = env.TURSO_DATABASE_URL || env.DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("Staging Turso credentials missing in .env.staging");
  }

  const client = createClient({ url, authToken });

  console.log("=== PHASE 0: RECONCILING STAGING CHAPTERS TO CANONICAL BAB ===");

  // 1. Check before state
  const beforeBab = await client.execute({
    sql: "SELECT id, mata_kuliah_id, code, title, order_index, status, legacy_chapter_id FROM bab WHERE mata_kuliah_id = 'mat-i' ORDER BY order_index ASC",
    args: []
  });
  console.log("\n[BEFORE] Bab in staging for mat-i:\n", JSON.stringify(beforeBab.rows, null, 2));

  // 2. Execute transaction:
  // - Move fixture chapter order_index to 99 and archive
  // - Insert legacy Limit chapter to bab
  // - Insert audit record into audit_mutasi
  const now = Date.now();
  const tx = await client.transaction("write");
  try {
    // Step A: Archive Plan 010 fixture
    await tx.execute({
      sql: `UPDATE bab
            SET order_index = 99, status = 'archived', updated_at = ?
            WHERE id = 'p010-20260803-plan010-assessment-v4-chapter'`,
      args: [now]
    });

    // Step B: Reconcile Limit chapter into bab
    await tx.execute({
      sql: `INSERT INTO bab (id, mata_kuliah_id, code, title, order_index, status, legacy_chapter_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              order_index = excluded.order_index,
              title = excluded.title,
              status = 'active',
              updated_at = excluded.updated_at`,
      args: [
        "b6eb209a-5b7d-421b-9460-52757c584113",
        "mat-i",
        "legacy-b6eb209a-5b7d-421b-9460-52757c584113",
        "Limit",
        2,
        "b6eb209a-5b7d-421b-9460-52757c584113",
        now,
        now
      ]
    });

    // Step C: Audit mutation
    await tx.execute({
      sql: `INSERT INTO audit_mutasi (id, actor_id, entity_type, entity_id, action, before_snapshot, after_snapshot, correlation_id, created_at)
            VALUES (?, NULL, 'bab', 'b6eb209a-5b7d-421b-9460-52757c584113', 'canonical_reconcile_from_legacy', NULL, ?, 'b6eb209a-5b7d-421b-9460-52757c584113', ?)`,
      args: [
        randomUUID(),
        JSON.stringify({ legacyChapterId: "b6eb209a-5b7d-421b-9460-52757c584113", title: "Limit", status: "active" }),
        now
      ]
    });

    await tx.commit();
    console.log("\nTransaction successfully committed!");
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  // 3. Check after state
  const afterBab = await client.execute({
    sql: "SELECT id, mata_kuliah_id, code, title, order_index, status, legacy_chapter_id FROM bab WHERE mata_kuliah_id = 'mat-i' AND status = 'active' ORDER BY order_index ASC",
    args: []
  });
  console.log("\n[AFTER] Active Bab in staging for mat-i:\n", JSON.stringify(afterBab.rows, null, 2));
}

main().catch((err) => {
  console.error("Reconcile error:", err);
  process.exit(1);
});
