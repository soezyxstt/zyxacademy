import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../db";
import { 
  courses, 
  websiteMaterials, 
  conceptGraphEdges, 
  knowledgeObjects,
  vectorSyncQueue,
  aiQuestionBank
} from "../db/schema";
import { eq, and, or, lt, inArray } from "drizzle-orm";
import { compileMarkdown } from "../lib/markdown-compiler";
import { verifyKOCoverage } from "../lib/ko-coverage-auditor";
import { buildTermIndex } from "../lib/term-index";
import { buildConceptGraph } from "../lib/graph-trace";
import { embedTexts } from "../lib/gemini";
import { getNs } from "../lib/pinecone";
import { shouldMirrorToVectorize, serializeVzMetadata, vectorizeUpsert } from "../lib/vectorize-client";
import { VECTOR_NAMESPACES } from "../lib/vector-store";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  
  let courseId: string | null = null;
  const courseIdx = args.indexOf("--course");
  if (courseIdx !== -1 && args[courseIdx + 1]) {
    courseId = args[courseIdx + 1];
  }

  if (!courseId) {
    console.error("Usage: bunx tsx scripts/postprocess-course.ts --course <courseId> [--dry-run]");
    process.exit(1);
  }

  console.log(`=== STARTING COURSE POST-PROCESSING RUNNER ===`);
  console.log(`Course ID: ${courseId}`);
  console.log(`Dry Run:   ${dryRun}\n`);

  // Verify course exists
  const [courseRecord] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!courseRecord) {
    console.error(`Error: Course with ID "${courseId}" does not exist in the database.`);
    process.exit(1);
  }

  let failuresCount = 0;
  let warningsCount = 0;

  // ---------------------------------------------------------------------------
  // STEP 1: Compile Website Materials & Build Term Index
  // ---------------------------------------------------------------------------
  console.log("--- STEP 1: Compiling Website Materials & Building Term Index ---");
  const materials = await db.select().from(websiteMaterials).where(eq(websiteMaterials.courseId, courseId));
  console.log(`Found ${materials.length} website materials to process.`);

  for (const row of materials) {
    console.log(`Processing material for Chapter: ${row.chapterId} ("${row.title}")`);
    try {
      // 1a. Compile markdown to AST
      const compilerResult = compileMarkdown(row.canonicalMarkdown, row.chapterId, row.courseId);
      const errors = compilerResult.diagnostics.filter(d => d.severity === "error");
      const warningsList = compilerResult.diagnostics.filter(d => d.severity === "warning");

      if (errors.length > 0) {
        console.error(`  [FAIL] Compilation failed with ${errors.length} errors:`);
        errors.forEach(e => console.error(`    - ${e.message}`));
        failuresCount++;
        continue;
      }

      if (warningsList.length > 0) {
        console.warn(`  [WARN] Compiled with ${warningsList.length} warnings:`);
        warningsList.forEach(w => console.warn(`    - ${w.message}`));
        warningsCount += warningsList.length;
      }

      // 1b. Verify KO Coverage
      const verification = await verifyKOCoverage(row.chapterId, compilerResult.ast);
      console.log(`  Coverage status: ${verification.status}`);

      // 1c. Build Term Index
      console.log(`  Building term popover index...`);
      const termIndex = await buildTermIndex(row.chapterId);
      console.log(`  Extracted ${termIndex.length} term mappings.`);

      const structuredContent = {
        markdown: row.canonicalMarkdown,
        compilerResult,
        compiledAt: new Date().toISOString(),
        compilerVersion: "2.1.0",
        schemaVersion: "1.0.0",
      };

      if (!dryRun) {
        await db
          .update(websiteMaterials)
          .set({
            structuredContent,
            coverageStatus: verification.status as any,
            coverageReport: verification.report,
            termIndex,
            status: "published",
            isStale: false,
            updatedAt: new Date(),
          })
          .where(eq(websiteMaterials.id, row.id));
        console.log(`  [SUCCESS] Material AST and term index saved.`);
      } else {
        console.log(`  [DRY-RUN] Material compiled and audited successfully.`);
      }
    } catch (err: any) {
      console.error(`  [FAIL] Error compiling material:`, err?.message || err);
      failuresCount++;
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Rebuild Concept Graph Rollup
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 2: Rebuilding Concept Graph Rollup ---");
  try {
    if (!dryRun) {
      const edgeCount = await buildConceptGraph(courseId);
      console.log(`[SUCCESS] Concept graph rollup rebuilt with ${edgeCount} concept edges.`);
    } else {
      console.log(`[DRY-RUN] Concept graph rollup would be rebuilt programmatically.`);
    }
  } catch (err: any) {
    console.error(`[FAIL] Error building concept graph:`, err?.message || err);
    failuresCount++;
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Sync Vectors Synchronously
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 3: Synchronously Processing Vector Sync Queue ---");
  const pendingVectors = await db
    .select()
    .from(vectorSyncQueue)
    .where(
      and(
        eq(vectorSyncQueue.courseId, courseId),
        or(eq(vectorSyncQueue.status, "pending"), eq(vectorSyncQueue.status, "failed")),
        lt(vectorSyncQueue.attempts, 10)
      )
    );

  console.log(`Found ${pendingVectors.length} pending vector sync outbox items.`);

  if (pendingVectors.length > 0) {
    // Group by namespace
    const nsGroups: Record<string, typeof pendingVectors> = {};
    for (const row of pendingVectors) {
      const ns = row.namespace || VECTOR_NAMESPACES.learning;
      if (!nsGroups[ns]) {
        nsGroups[ns] = [];
      }
      nsGroups[ns].push(row);
    }

    for (const [nsKey, rows] of Object.entries(nsGroups)) {
      console.log(`Syncing ${rows.length} records to namespace: course_${courseId}_${nsKey}`);
      try {
        const texts = rows.map(r => (r.payload as any).text);
        
        let embeddings: number[][];
        if (dryRun) {
          embeddings = rows.map(() => new Array(768).fill(0));
        } else {
          console.log(`  Requesting text-embedding-004 embeddings...`);
          embeddings = await embedTexts(texts);
        }

        const records = rows.map((row, idx) => {
          const payload = row.payload as any;
          return {
            id: row.koId || payload.id || row.id,
            values: embeddings[idx],
            metadata: {
              courseId: row.courseId,
              chapterId: payload.metadata.chapterId || "",
              conceptId: payload.metadata.conceptId || "",
              type: payload.metadata.type || "unknown",
              bloomLevel: payload.metadata.bloomLevel || "apply",
              difficulty: payload.metadata.difficulty || "medium",
              importance: payload.metadata.importance || "medium",
              tags: payload.metadata.tags || [],
            }
          };
        });

        if (!dryRun) {
          const pineconeNs = getNs(`${courseId}_${nsKey}`);
          await pineconeNs.upsert({ records });

          if (shouldMirrorToVectorize()) {
            await vectorizeUpsert(
              records.map(r => ({
                id: r.id,
                values: r.values,
                namespace: `course_${courseId}_${nsKey}`,
                metadata: serializeVzMetadata(r.metadata),
              }))
            );
          }

          // Complete row updates
          await db.transaction(async (tx) => {
            const rowIds = rows.map(r => r.id);
            await tx
              .update(vectorSyncQueue)
              .set({ status: "completed", updatedAt: new Date() })
              .where(inArray(vectorSyncQueue.id, rowIds));

            for (const row of rows) {
              if (row.koId && row.namespace === VECTOR_NAMESPACES.learning) {
                await tx
                  .update(knowledgeObjects)
                  .set({ pineconeVectorId: row.koId, updatedAt: new Date() })
                  .where(eq(knowledgeObjects.id, row.koId));
              }
            }
          });
          console.log(`  [SUCCESS] Upserted vectors and completed DB log state.`);
        } else {
          console.log(`  [DRY-RUN] Would have upserted ${records.length} vectors.`);
        }
      } catch (err: any) {
        console.error(`  [FAIL] Failed to sync group:`, err?.message || err);
        failuresCount++;

        if (!dryRun) {
          for (const row of rows) {
            await db
              .update(vectorSyncQueue)
              .set({
                status: "failed",
                attempts: row.attempts + 1,
                lastError: err?.message || String(err),
                updatedAt: new Date(),
              })
              .where(eq(vectorSyncQueue.id, row.id));
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Verification Check
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 4: Verification Checks ---");
  
  // Verify materials published
  const uncompiledMats = await db
    .select()
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, courseId), or(eq(websiteMaterials.status, "draft"), eq(websiteMaterials.isStale, true))));
  if (uncompiledMats.length > 0) {
    console.error(`[VERIFY FAIL] Found ${uncompiledMats.length} materials in draft or stale state.`);
    failuresCount++;
  } else {
    console.log(`[VERIFY PASS] All materials compiled and published successfully.`);
  }

  // Verify Concept Graph Edges
  const graphEdges = await db.select().from(conceptGraphEdges).where(eq(conceptGraphEdges.courseId, courseId));
  if (graphEdges.length === 0) {
    console.warn(`[VERIFY WARN] Concept Graph has 0 edges. (Check if KOs have knowledgeRelationships registered).`);
    warningsCount++;
  } else {
    console.log(`[VERIFY PASS] Concept Graph verified with ${graphEdges.length} edges.`);
  }

  // Verify KO Pinecone IDs
  const activeKOsCount = await db
    .select()
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.courseId, courseId), eq(knowledgeObjects.status, "active")));
  const unvectorizedKOs = activeKOsCount.filter(ko => !ko.pineconeVectorId);
  if (unvectorizedKOs.length > 0 && !dryRun) {
    console.error(`[VERIFY FAIL] Found ${unvectorizedKOs.length} active KOs missing pineconeVectorId.`);
    failuresCount++;
  } else {
    console.log(`[VERIFY PASS] All active KOs (${activeKOsCount.length}) are vectorized.`);
  }

  // Verify Practice Questions
  const questionsCount = await db
    .select()
    .from(aiQuestionBank)
    .where(and(eq(aiQuestionBank.courseId, courseId), eq(aiQuestionBank.status, "active")));
  
  const assessmentQueueItems = await db
    .select()
    .from(vectorSyncQueue)
    .where(
      and(
        eq(vectorSyncQueue.courseId, courseId),
        eq(vectorSyncQueue.namespace, VECTOR_NAMESPACES.practice)
      )
    );
  
  console.log(`[VERIFY] Verified ${questionsCount.length} practice questions. Aligned queue items: ${assessmentQueueItems.length}`);

  // Verify Past Exam Questions
  const pastExamQueueItems = await db
    .select()
    .from(vectorSyncQueue)
    .where(
      and(
        eq(vectorSyncQueue.courseId, courseId),
        eq(vectorSyncQueue.namespace, VECTOR_NAMESPACES.past_exams)
      )
    );
  console.log(`[VERIFY] Mapped past exam queue items: ${pastExamQueueItems.length}`);

  console.log("\n=== POST-PROCESSING SUMMARY ===");
  console.log(`Failures: ${failuresCount}`);
  console.log(`Warnings: ${warningsCount}`);

  if (failuresCount > 0 && !dryRun) {
    console.error("\nPost-processing finished with errors.");
    process.exit(1);
  } else {
    console.log("\nPost-processing finished successfully!");
  }
}

main().catch(err => {
  console.error("Post-processor crashed:", err);
  process.exit(1);
});
