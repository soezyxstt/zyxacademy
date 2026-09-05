import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { parseEnvFile } from "@/lib/staging/staging-guard";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function main() {
  const env = parseEnvFile(".env.staging");
  const url = env.TURSO_DATABASE_URL || env.DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("Staging Turso credentials missing in .env.staging");
  }

  const client = createClient({ url, authToken });

  console.log("=== MIGRATING COURSE MATERIALS TO CANONICAL SUMBER_MATERI ===");

  // 1. Get active admin creator
  const adminRes = await client.execute(`
    SELECT p.id
    FROM pengguna p
    INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
    INNER JOIN peran r ON r.id = pp.peran_id
    WHERE p.status = 'active' AND r.code = 'admin'
    LIMIT 1
  `);

  if (adminRes.rows.length === 0) {
    throw new Error("No active admin user found in pengguna");
  }

  const creatorId = String(adminRes.rows[0].id);
  console.log(`Found creator admin ID: ${creatorId}`);

  // 2. Fetch all bab in staging
  const babRes = await client.execute(`
    SELECT id, mata_kuliah_id, code, title, legacy_chapter_id, status
    FROM bab
    WHERE status = 'active'
  `);
  const babList = babRes.rows as unknown as Array<{
    id: string;
    mata_kuliah_id: string;
    code: string;
    title: string;
    legacy_chapter_id: string | null;
    status: string;
  }>;
  console.log(`Found ${babList.length} active bab in staging.`);

  // Create lookup map from legacyChapterId -> bab.id AND bab.id -> bab.id
  const babMap = new Map<string, string>();
  for (const b of babList) {
    babMap.set(b.id, b.id);
    if (b.legacy_chapter_id) {
      babMap.set(b.legacy_chapter_id, b.id);
    }
  }

  // 3. Fetch all legacy course_materials
  const cmRes = await client.execute(`
    SELECT id, course_id, title, type, subcategory, file_url, checksum, chapter_ids, created_at, updated_at
    FROM course_materials
    ORDER BY course_id, title
  `);
  console.log(`Found ${cmRes.rows.length} course_materials to transfer.`);

  const now = Date.now();
  let migratedCount = 0;

  for (const row of cmRes.rows) {
    const cmId = String(row.id);
    const courseId = String(row.course_id);
    const title = String(row.title);
    const fileUrl = String(row.file_url);
    const checksum = row.checksum ? String(row.checksum) : sha256(fileUrl);
    const createdAt = typeof row.created_at === "number" ? row.created_at : now;
    const updatedAt = typeof row.updated_at === "number" ? row.updated_at : now;

    // Parse chapter_ids
    let targetBabId: string | null = null;
    try {
      const parsedChapters = typeof row.chapter_ids === "string" ? JSON.parse(row.chapter_ids) : row.chapter_ids;
      if (Array.isArray(parsedChapters) && parsedChapters.length > 0) {
        for (const chapId of parsedChapters) {
          if (babMap.has(chapId)) {
            targetBabId = babMap.get(chapId)!;
            break;
          }
        }
      }
    } catch (e) {
      console.warn(`Could not parse chapter_ids for ${title}:`, row.chapter_ids);
    }

    const smId = `sm-legacy-${cmId}`;
    const chunkId = `chunk-legacy-${cmId}`;
    const chunkContent = `# ${title}\n\nDokumen referensi mata kuliah: ${title}\nTipe: ${row.type ?? "materi"}\nBerkas: ${fileUrl}`;

    console.log(`\nMigrating document: "${title}"`);
    console.log(`  -> Course: ${courseId}, Bab: ${targetBabId ?? "(unassigned)"}`);
    console.log(`  -> Target ID: ${smId}`);

    const tx = await client.transaction("write");
    try {
      // Upsert into sumber_materi
      await tx.execute({
        sql: `INSERT INTO sumber_materi (
                id, mata_kuliah_id, bab_id, source_type, title,
                canonical_uri_or_r2_key, version, checksum, status,
                creator_id, created_at, updated_at
              ) VALUES (?, ?, ?, 'pdf', ?, ?, 1, ?, 'active', ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                mata_kuliah_id = excluded.mata_kuliah_id,
                bab_id = excluded.bab_id,
                title = excluded.title,
                canonical_uri_or_r2_key = excluded.canonical_uri_or_r2_key,
                checksum = excluded.checksum,
                status = 'active',
                updated_at = excluded.updated_at`,
        args: [
          smId,
          courseId,
          targetBabId,
          title,
          fileUrl,
          checksum,
          creatorId,
          createdAt,
          updatedAt,
        ],
      });

      // Upsert into potongan_sumber
      await tx.execute({
        sql: `INSERT INTO potongan_sumber (
                id, sumber_materi_id, source_version, content,
                start_offset, end_offset, checksum, embedding_eligible
              ) VALUES (?, ?, 1, ?, 0, ?, ?, 0)
              ON CONFLICT (id) DO UPDATE SET
                content = excluded.content,
                end_offset = excluded.end_offset,
                checksum = excluded.checksum`,
        args: [
          chunkId,
          smId,
          chunkContent,
          chunkContent.length,
          sha256(chunkContent),
        ],
      });

      // Record audit_mutasi
      await tx.execute({
        sql: `INSERT INTO audit_mutasi (
                id, actor_id, entity_type, entity_id, action,
                after_snapshot, correlation_id, created_at
              ) VALUES (?, ?, 'sumber_materi', ?, 'canonical_migrate_from_legacy', ?, ?, ?)`,
        args: [
          randomUUID(),
          creatorId,
          smId,
          JSON.stringify({ legacyMaterialId: cmId, courseId, targetBabId, title, fileUrl }),
          cmId,
          now,
        ],
      });

      await tx.commit();
      migratedCount++;
      console.log(`  -> Successfully committed!`);
    } catch (err) {
      await tx.rollback();
      console.error(`  -> Failed to migrate ${title}:`, err);
      throw err;
    }
  }

  console.log(`\n=== MIGRATION FINISHED: ${migratedCount} documents migrated to sumber_materi ===`);

  // Verify resulting count
  const verifyRes = await client.execute(`
    SELECT sm.id, sm.mata_kuliah_id, sm.title, sm.source_type, sm.canonical_uri_or_r2_key, b.title as bab_title
    FROM sumber_materi sm
    LEFT JOIN bab b ON b.id = sm.bab_id
    WHERE sm.mata_kuliah_id = 'mat-i'
    ORDER BY sm.bab_id, sm.title
  `);
  console.log("\nCurrent sumber_materi for mat-i in staging:");
  for (const r of verifyRes.rows) {
    console.log(`- [${r.bab_title ?? "NO_BAB"}] ${r.title} (${r.source_type}: ${r.canonical_uri_or_r2_key})`);
  }
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
