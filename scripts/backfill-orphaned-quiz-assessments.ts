/**
 * Script: backfill-orphaned-quiz-assessments.ts
 *
 * Scans the database (local SQLite or remote Turso) for all `quiz_templates`
 * that do not yet have corresponding canonical `blueprint_asesmen` and `asesmen` rows,
 * and synchronizes them idempotently.
 *
 * Usage:
 *   bun run scripts/backfill-orphaned-quiz-assessments.ts
 */

import { syncOrphanedQuizTemplatesToAssessments } from "../lib/asesmen/quiz-canonical-sync";

async function main() {
  console.log("Starting reconciliation of orphaned quiz templates to canonical assessments...");
  const result = await syncOrphanedQuizTemplatesToAssessments();
  console.log(`Reconciliation completed.`);
  console.log(`Total quiz templates checked: ${result.totalChecked}`);
  console.log(`Reconciled assessments created: ${result.reconciledCount}`);

  if (result.errors.length > 0) {
    console.error(`Encountered ${result.errors.length} errors during reconciliation:`);
    for (const err of result.errors) {
      console.error(`- Template ${err.id}: ${err.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during reconciliation script execution:", err);
  process.exit(1);
});
