import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mataKuliah, publicDemoSnapshots } from "@/db/schema";
import { fictionalDemoSnapshot, publicDemoCourseTitles } from "@/lib/demo/fictional-snapshot";
import { resolvePublicFreeFirstChapter } from "@/lib/demo/legacy-eligibility";
import { sanitizeDemoArticle } from "@/lib/demo/public-content-sanitizer";
import { addSelectedFallback, catalogueProgress } from "@/lib/demo/catalogue";
import { getDemoCatalogue } from "@/lib/demo/catalogue-repository";
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
  const catalogue = await getDemoCatalogue(row.id);
  if (!products || !products.flashcards.length || !catalogue) throw new Error(`DEMO_PRODUCTS_UNAVAILABLE:${row.id}`);
  sanitizeDemoArticle(products.article);
  const complete = addSelectedFallback(catalogue, products.selected, { article: products.article.title, diktat: products.diktat.title });
  const snapshot = fictionalDemoSnapshot(row.id, row.title, catalogueProgress(row.id, complete));
  snapshots.push(snapshot);
  console.log(JSON.stringify({ courseId: row.id, title: row.title, article: products.selected.articleId,
    diktat: products.selected.diktatId, flashcards: products.selected.flashcardSetId,
    questions: products.quiz.map(q => q.id), revision: snapshot.revision, progress: snapshot.course,
    historyCompleted: snapshot.history.reduce((sum, day) => sum + day.materialsCompleted, 0), ready: true }));
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
