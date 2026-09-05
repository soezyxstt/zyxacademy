import { createClient } from "@libsql/client";
import { parseEnvFile } from "@/lib/staging/staging-guard";

async function check() {
  const env = parseEnvFile(".env.staging");
  const client = createClient({
    url: (env.TURSO_DATABASE_URL || env.DATABASE_URL)!,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  const cm = await client.execute("SELECT count(*) as count FROM course_materials");
  console.log("Total course_materials:", cm.rows[0].count);

  const cmList = await client.execute("SELECT id, course_id, title, type, file_url, chapter_ids FROM course_materials");
  console.log("\ncourse_materials:");
  for (const row of cmList.rows) {
    console.log(`- [${row.course_id}] ${row.title} (ID: ${row.id}, chapters: ${row.chapter_ids})`);
  }

  const sm = await client.execute("SELECT count(*) as count FROM sumber_materi");
  console.log("\nTotal sumber_materi:", sm.rows[0].count);

  const smList = await client.execute("SELECT id, mata_kuliah_id, bab_id, title, source_type, status FROM sumber_materi");
  console.log("\nsumber_materi:");
  for (const row of smList.rows) {
    console.log(`- [${row.mata_kuliah_id} / bab: ${row.bab_id}] ${row.title} (type: ${row.source_type}, status: ${row.status})`);
  }
}

check().catch(console.error);
