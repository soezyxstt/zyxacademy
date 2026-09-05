import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

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

function resolveDbCredentials(): { url: string; authToken?: string; source: string } {
  const rootDir = process.cwd();
  const envProd = parseEnvFile(join(rootDir, ".env.prod"));
  const envMain = parseEnvFile(join(rootDir, ".env"));
  const envStaging = parseEnvFile(join(rootDir, ".env.staging"));

  // Check if an explicit env file flag was provided (e.g. --env=.env.staging or --env=.env.prod)
  const envArg = process.argv.find((arg) => arg.startsWith("--env="));
  let customEnv: Record<string, string> = {};
  if (envArg) {
    const targetPath = join(rootDir, envArg.replace("--env=", ""));
    customEnv = parseEnvFile(targetPath);
  }

  const url =
    customEnv.TURSO_DATABASE_URL ||
    customEnv.TURSO_CONNECTION_URL ||
    customEnv.DATABASE_URL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_CONNECTION_URL ||
    envProd.TURSO_DATABASE_URL ||
    envProd.TURSO_CONNECTION_URL ||
    (envProd.DATABASE_URL && !envProd.DATABASE_URL.startsWith("postgres") ? envProd.DATABASE_URL : undefined) ||
    envMain.TURSO_DATABASE_URL ||
    envMain.TURSO_CONNECTION_URL ||
    (envMain.DATABASE_URL && !envMain.DATABASE_URL.startsWith("postgres") ? envMain.DATABASE_URL : undefined) ||
    envStaging.TURSO_DATABASE_URL ||
    envStaging.TURSO_CONNECTION_URL ||
    envStaging.DATABASE_URL;

  const authToken =
    customEnv.TURSO_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN ||
    envProd.TURSO_AUTH_TOKEN ||
    envMain.TURSO_AUTH_TOKEN ||
    envStaging.TURSO_AUTH_TOKEN;

  let source = "process.env";
  if (customEnv.TURSO_DATABASE_URL || customEnv.TURSO_CONNECTION_URL || customEnv.DATABASE_URL) {
    source = envArg || "custom";
  } else if (envProd.TURSO_DATABASE_URL || envProd.TURSO_CONNECTION_URL || envProd.DATABASE_URL) {
    source = ".env.prod";
  } else if (envMain.TURSO_DATABASE_URL || envMain.TURSO_CONNECTION_URL || envMain.DATABASE_URL) {
    source = ".env";
  } else if (envStaging.TURSO_DATABASE_URL || envStaging.TURSO_CONNECTION_URL || envStaging.DATABASE_URL) {
    source = ".env.staging";
  }

  if (!url) {
    throw new Error(
      "Database URL not found in environment or .env files. Set TURSO_DATABASE_URL or DATABASE_URL.",
    );
  }

  return { url, authToken, source };
}

async function main() {
  const isApply = process.argv.includes("--apply");
  const mode = isApply ? "APPLY (Write to database)" : "DRY-RUN (Read-only simulation)";

  console.log("==================================================================");
  console.log("  Zyx Academy: Legacy to Canonical Content Migration");
  console.log("==================================================================");
  console.log(`[Mode] ${mode}`);

  const { url, authToken, source } = resolveDbCredentials();
  const maskedHost = url.replace(/\/\/.*@/, "//***@");
  console.log(`[Database Source] ${source}`);
  console.log(`[Database Host]   ${maskedHost}\n`);

  const client = createClient({ url, authToken });

  try {
    // -------------------------------------------------------------------------
    // Phase 0: Ensure an active admin user exists in pengguna (for foreign keys)
    // -------------------------------------------------------------------------
    console.log("--- [Phase 0] Verifying Canonical Admin Identity ---");
    let adminId: string | null = null;

    const activePenggunaAdminRes = await client.execute(`
      SELECT p.id, p.status
      FROM pengguna p
      INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
      INNER JOIN peran r ON r.id = pp.peran_id
      WHERE p.status = 'active' AND r.code = 'admin'
      LIMIT 1
    `);

    if (activePenggunaAdminRes.rows.length > 0) {
      adminId = String(activePenggunaAdminRes.rows[0].id);
      console.log(`[OK] Active canonical admin found in pengguna: ${adminId}`);
    } else {
      // Look up admin in legacy user table
      const legacyAdminRes = await client.execute(`
        SELECT id, name, email
        FROM user
        WHERE role = 'admin'
        ORDER BY created_at ASC
        LIMIT 1
      `);

      if (legacyAdminRes.rows.length > 0) {
        adminId = String(legacyAdminRes.rows[0].id);
        const adminEmail = String(legacyAdminRes.rows[0].email);
        console.log(`[Info] Found legacy admin in user table: ${adminId} (${adminEmail})`);

        if (isApply) {
          const now = Date.now();
          await client.execute({
            sql: `INSERT INTO pengguna (id, status, created_at, updated_at)
                  VALUES (?, 'active', ?, ?)
                  ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = excluded.updated_at`,
            args: [adminId, now, now],
          });

          // Ensure peran admin exists
          const peranRes = await client.execute("SELECT id FROM peran WHERE code = 'admin' LIMIT 1");
          let peranId = peranRes.rows.length > 0 ? String(peranRes.rows[0].id) : "peran-admin";

          if (peranRes.rows.length === 0) {
            await client.execute({
              sql: `INSERT INTO peran (id, code, name, status, created_at, updated_at)
                    VALUES (?, 'admin', 'Administrator', 'active', ?, ?)
                    ON CONFLICT (id) DO NOTHING`,
              args: [peranId, now, now],
            });
          }

          // Link pengguna_peran
          const membershipId = `pp-${adminId}-${peranId}`;
          await client.execute({
            sql: `INSERT INTO pengguna_peran (id, pengguna_id, peran_id, status, created_at, updated_at)
                  VALUES (?, ?, ?, 'active', ?, ?)
                  ON CONFLICT (id) DO NOTHING`,
            args: [membershipId, adminId, peranId, now, now],
          });
          console.log(`[OK] Seeded canonical admin into pengguna and pengguna_peran: ${adminId}`);
        } else {
          console.log(`[Plan] Would ensure admin ${adminId} is registered in pengguna & pengguna_peran`);
        }
      } else {
        // Fallback placeholder admin if no user exists yet
        adminId = "system-admin-canonical";
        console.warn("[Warning] No admin user found in user or pengguna table. Using fallback ID: system-admin-canonical");
        if (isApply) {
          const now = Date.now();
          await client.execute({
            sql: `INSERT INTO pengguna (id, status, created_at, updated_at)
                  VALUES (?, 'active', ?, ?)
                  ON CONFLICT (id) DO NOTHING`,
            args: [adminId, now, now],
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // Phase 1: courses -> mata_kuliah
    // -------------------------------------------------------------------------
    console.log("\n--- [Phase 1] Migrating courses -> mata_kuliah ---");
    const coursesRes = await client.execute(`
      SELECT id, title, category, description
      FROM courses
      ORDER BY title ASC
    `);

    console.log(`Found ${coursesRes.rows.length} course(s) in legacy courses table.`);
    let coursesMigrated = 0;

    for (const row of coursesRes.rows) {
      const courseId = String(row.id);
      const title = String(row.title);
      const code = `legacy-${courseId}`;
      const now = Date.now();
      const createdAt = now;
      const updatedAt = now;

      if (isApply) {
        await client.execute({
          sql: `INSERT INTO mata_kuliah (id, code, title, status, legacy_course_id, created_at, updated_at)
                VALUES (?, ?, ?, 'active', ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                  title = excluded.title,
                  status = 'active',
                  legacy_course_id = excluded.legacy_course_id,
                  updated_at = excluded.updated_at`,
          args: [courseId, code, title, courseId, createdAt, updatedAt],
        });
      }
      coursesMigrated++;
    }
    console.log(`[OK] ${coursesMigrated} course(s) ${isApply ? "migrated / updated in" : "planned for"} mata_kuliah.`);

    // -------------------------------------------------------------------------
    // Phase 2: chapters -> bab
    // -------------------------------------------------------------------------
    console.log("\n--- [Phase 2] Migrating chapters -> bab ---");
    const chaptersRes = await client.execute(`
      SELECT id, course_id, title, description, order_index, status, created_at, updated_at
      FROM chapters
      ORDER BY course_id, order_index ASC
    `);

    console.log(`Found ${chaptersRes.rows.length} chapter(s) in legacy chapters table.`);
    let chaptersMigrated = 0;

    for (const row of chaptersRes.rows) {
      const chapterId = String(row.id);
      const courseId = String(row.course_id);
      const title = String(row.title);
      const orderIndex = typeof row.order_index === "number" ? row.order_index : 0;
      const status = row.status === "draft" ? "draft" : "active";
      const code = `legacy-${chapterId}`;
      const now = Date.now();
      const createdAt = typeof row.created_at === "number" ? row.created_at : now;
      const updatedAt = typeof row.updated_at === "number" ? row.updated_at : now;

      if (isApply) {
        await client.execute({
          sql: `INSERT INTO bab (id, mata_kuliah_id, code, title, order_index, status, legacy_chapter_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                  mata_kuliah_id = excluded.mata_kuliah_id,
                  title = excluded.title,
                  order_index = excluded.order_index,
                  status = excluded.status,
                  legacy_chapter_id = excluded.legacy_chapter_id,
                  updated_at = excluded.updated_at`,
          args: [chapterId, courseId, code, title, orderIndex, status, chapterId, createdAt, updatedAt],
        });
      }
      chaptersMigrated++;
    }
    console.log(`[OK] ${chaptersMigrated} chapter(s) ${isApply ? "migrated / updated in" : "planned for"} bab.`);

    // Build lookup map: legacyChapterId -> bab.id AND bab.id -> bab.id
    const babLookup = new Map<string, string>();
    for (const row of chaptersRes.rows) {
      const chapterId = String(row.id);
      babLookup.set(chapterId, chapterId);
    }

    // Also fetch bab currently in database to ensure mapping accuracy
    const currentBabRes = await client.execute("SELECT id, legacy_chapter_id FROM bab");
    for (const b of currentBabRes.rows) {
      const bId = String(b.id);
      babLookup.set(bId, bId);
      if (b.legacy_chapter_id) {
        babLookup.set(String(b.legacy_chapter_id), bId);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 3: course_materials -> sumber_materi & potongan_sumber
    // -------------------------------------------------------------------------
    console.log("\n--- [Phase 3] Migrating course_materials -> sumber_materi & potongan_sumber ---");
    const materialsRes = await client.execute(`
      SELECT id, course_id, title, type, subcategory, year, file_url, checksum, chapter_ids, created_at, updated_at
      FROM course_materials
      ORDER BY course_id, title ASC
    `);

    console.log(`Found ${materialsRes.rows.length} course material(s) in legacy course_materials table.`);
    let materialsMigrated = 0;
    const now = Date.now();

    for (const row of materialsRes.rows) {
      const cmId = String(row.id);
      const courseId = String(row.course_id);
      const title = String(row.title);
      const fileUrl = String(row.file_url);
      const checksum = row.checksum ? String(row.checksum) : sha256(fileUrl);
      const createdAt = typeof row.created_at === "number" ? row.created_at : now;
      const updatedAt = typeof row.updated_at === "number" ? row.updated_at : now;

      // Determine target bab ID from chapter_ids json array if possible
      let targetBabId: string | null = null;
      try {
        const parsedChapters =
          typeof row.chapter_ids === "string" ? JSON.parse(row.chapter_ids) : row.chapter_ids;
        if (Array.isArray(parsedChapters) && parsedChapters.length > 0) {
          for (const chapId of parsedChapters) {
            if (babLookup.has(String(chapId))) {
              targetBabId = babLookup.get(String(chapId))!;
              break;
            }
          }
        }
      } catch {
        // Fallback: unassigned bab
      }

      const smId = `sm-legacy-${cmId}`;
      const chunkId = `chunk-legacy-${cmId}`;
      const chunkContent = `# ${title}\n\nDokumen referensi mata kuliah: ${title}\nTipe: ${row.type ?? "materi"}\nBerkas: ${fileUrl}`;
      const chunkChecksum = sha256(chunkContent);

      if (isApply) {
        // 1. Upsert sumber_materi
        await client.execute({
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
                  creator_id = excluded.creator_id,
                  updated_at = excluded.updated_at`,
          args: [
            smId,
            courseId,
            targetBabId,
            title,
            fileUrl,
            checksum,
            adminId,
            createdAt,
            updatedAt,
          ],
        });

        // 2. Upsert potongan_sumber
        await client.execute({
          sql: `INSERT INTO potongan_sumber (
                  id, sumber_materi_id, source_version, content,
                  page_number, section_locator, start_offset, end_offset,
                  checksum, embedding_eligible, created_at, updated_at
                ) VALUES (?, ?, 1, ?, NULL, NULL, 0, ?, ?, 1, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                  content = excluded.content,
                  end_offset = excluded.end_offset,
                  checksum = excluded.checksum,
                  updated_at = excluded.updated_at`,
          args: [
            chunkId,
            smId,
            chunkContent,
            chunkContent.length,
            chunkChecksum,
            createdAt,
            updatedAt,
          ],
        });
      }
      materialsMigrated++;
    }
    console.log(
      `[OK] ${materialsMigrated} material(s) ${isApply ? "migrated / updated in" : "planned for"} sumber_materi & potongan_sumber.`,
    );

    // -------------------------------------------------------------------------
    // Phase 4: Final verification and summary
    // -------------------------------------------------------------------------
    console.log("\n--- [Phase 4] Post-Migration Row Count Audit ---");

    const [
      coursesCnt,
      mataKuliahCnt,
      chaptersCnt,
      babCnt,
      cmCnt,
      smCnt,
      psCnt,
    ] = await Promise.all([
      client.execute("SELECT COUNT(*) as c FROM courses"),
      client.execute("SELECT COUNT(*) as c FROM mata_kuliah"),
      client.execute("SELECT COUNT(*) as c FROM chapters"),
      client.execute("SELECT COUNT(*) as c FROM bab"),
      client.execute("SELECT COUNT(*) as c FROM course_materials"),
      client.execute("SELECT COUNT(*) as c FROM sumber_materi"),
      client.execute("SELECT COUNT(*) as c FROM potongan_sumber"),
    ]);

    console.log("Entity                  | Legacy Count | Canonical Count");
    console.log("------------------------+--------------+----------------");
    console.log(`Courses / Mata Kuliah   | ${String(coursesCnt.rows[0].c).padEnd(12)} | ${String(mataKuliahCnt.rows[0].c).padEnd(15)}`);
    console.log(`Chapters / Bab          | ${String(chaptersCnt.rows[0].c).padEnd(12)} | ${String(babCnt.rows[0].c).padEnd(15)}`);
    console.log(`Materials / Sumber      | ${String(cmCnt.rows[0].c).padEnd(12)} | ${String(smCnt.rows[0].c).padEnd(15)} (chunks: ${psCnt.rows[0].c})`);

    if (isApply) {
      console.log("\n--- [Phase 5] Foreign Key Integrity Check ---");
      const fkCheck = await client.execute("PRAGMA foreign_key_check");
      if (fkCheck.rows.length > 0) {
        console.error(`[ERROR] Foreign key violations detected (${fkCheck.rows.length}):`);
        console.error(JSON.stringify(fkCheck.rows, null, 2));
        process.exitCode = 1;
      } else {
        console.log("[OK] PRAGMA foreign_key_check passed with 0 violations.");
      }
    }

    console.log("\n==================================================================");
    if (isApply) {
      console.log("  MIGRATION COMPLETED SUCCESSFULLY!");
    } else {
      console.log("  DRY-RUN COMPLETED! Run with --apply to commit these changes.");
    }
    console.log("==================================================================");
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("\n[FATAL ERROR during migration]:", err);
  process.exit(1);
});
