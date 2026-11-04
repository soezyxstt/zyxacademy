import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mataKuliah, publicDemoSnapshots } from "@/db/schema";
import { fictionalDemoSnapshot, publicDemoCourseTitles } from "@/lib/demo/fictional-snapshot";
import { resolvePublicFreeFirstChapter } from "@/lib/demo/legacy-eligibility";
import { sanitizeDemoArticle } from "@/lib/demo/public-content-sanitizer";
import { assertTarget } from "./neon/import-core";

// Run with Bun's react-server condition. Default is a read-only preflight.
assertTarget(process.env.DATABASE_URL ?? "", process.env.NEON_EXPECTED_HOST ?? "", process.env.NEON_EXPECTED_DATABASE ?? "");
const rows = await db.select({ id: mataKuliah.id, title: mataKuliah.title }).from(mataKuliah)
  .where(and(eq(mataKuliah.status, "active"), inArray(mataKuliah.title, [...publicDemoCourseTitles])));
if (publicDemoCourseTitles.some(title => rows.filter(row => row.title === title).length !== 1)
  || new Set(rows.map(row => row.id)).size !== 4) throw new Error("DEMO_COURSE_IDENTITY_MISSING_OR_AMBIGUOUS");
const snapshots = [];
for (const row of rows) {
  const products = await resolvePublicFreeFirstChapter(row.id);
  if (!products || !products.flashcards.length) throw new Error(`DEMO_PRODUCTS_UNAVAILABLE:${row.id}`);
  sanitizeDemoArticle(products.article);
  snapshots.push(fictionalDemoSnapshot(row.id));
  console.log(JSON.stringify({ courseId: row.id, title: row.title, article: products.selected.articleId,
    diktat: products.selected.diktatId, flashcards: products.selected.flashcardSetId,
    questions: products.quiz.map(q => q.id), ready: true }));
}
if (process.argv.includes("--apply")) {
  await db.transaction(async tx => {
    for (const snapshot of snapshots) {
      await tx.insert(publicDemoSnapshots).values({ id: `demo-${snapshot.courseId}`, courseId: snapshot.courseId, snapshot })
        .onConflictDoUpdate({ target: publicDemoSnapshots.courseId, set: { snapshot, updatedAt: new Date() } });
    }
  });
  console.log("Four validated fictional baselines saved");
} else console.log("Read-only preflight passed; no snapshots written");
process.exit(0);
