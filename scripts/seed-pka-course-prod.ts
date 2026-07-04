/**
 * Seeds ONLY the Tutorial PKA course row into the production Turso database.
 *
 * Unlike scripts/seed-pka.ts (which also seeds quiz templates, simulation
 * stages, and placeholder questions into the local dev DB), this script inserts
 * just the minimal course metadata. Quizzes, questions, and simulation stages
 * are expected to be authored manually via the admin tooling.
 *
 * Run: bunx tsx scripts/seed-pka-course-prod.ts
 * Add --commit to actually write; without it the script does a dry run.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { courses } from "../db/schema";
import { PKA_COURSE_ID } from "../lib/pka-config";

// Keep in sync with the course definition in scripts/seed-pka.ts.
const PKA_COURSE = {
  id: PKA_COURSE_ID,
  title: "Tutorial PKA",
  category: "PKA" as const,
  description: "Persiapan Pemetaan Kesiapan Akademik (PKA) ITB; Matematika, Fisika, Kimia.",
};

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`=== Seed Tutorial PKA course into PRODUCTION (${commit ? "COMMIT" : "DRY RUN"}) ===`);

  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_CONNECTION_URL ||
    (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgres")
      ? process.env.DATABASE_URL
      : undefined);
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || (!url.startsWith("libsql://") && !url.startsWith("https://"))) {
    console.error("Error: production DB URL must be a remote Turso URL (libsql:// or https://). Refusing to run.");
    process.exit(1);
  }
  if (!authToken) {
    console.error("Error: TURSO_AUTH_TOKEN is missing. Refusing to touch production without an auth token.");
    process.exit(1);
  }

  // Print only the host, never the token or full path with query params.
  const host = url.replace(/^\w+:\/\//, "").split(/[/?]/)[0];
  console.log(`Target production host: ${host}`);

  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema: { courses } });

  const [existing] = await db.select().from(courses).where(eq(courses.id, PKA_COURSE_ID));
  if (existing) {
    console.log("Course already exists in production:");
    console.log(`  id=${existing.id} title=${existing.title} category=${existing.category}`);
    console.log("Values to upsert:");
    console.log(`  title=${PKA_COURSE.title} category=${PKA_COURSE.category}`);
  } else {
    console.log("Course does not exist yet in production. Will insert:");
    console.log(`  id=${PKA_COURSE.id} title=${PKA_COURSE.title} category=${PKA_COURSE.category}`);
  }

  if (!commit) {
    console.log("\nDry run only; no changes written. Re-run with --commit to apply.");
    process.exit(0);
  }

  await db
    .insert(courses)
    .values(PKA_COURSE)
    .onConflictDoUpdate({
      target: courses.id,
      set: {
        title: PKA_COURSE.title,
        category: PKA_COURSE.category,
        description: PKA_COURSE.description,
      },
    });

  const [after] = await db.select().from(courses).where(eq(courses.id, PKA_COURSE_ID));
  console.log("\nDone. Production course row now:");
  console.log(`  id=${after?.id} title=${after?.title} category=${after?.category}`);
  console.log(`  description=${after?.description}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-pka-course-prod failed:", err);
  process.exit(1);
});
