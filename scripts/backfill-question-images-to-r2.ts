#!/usr/bin/env bun
/**
 * Backfill script to migrate base64 data URI images in question prompts,
 * options, and explanations to Cloudflare R2 storage.
 *
 * Usage:
 *   bun scripts/backfill-question-images-to-r2.ts                 # Dry-run (all courses)
 *   bun scripts/backfill-question-images-to-r2.ts --course=ms3103 # Dry-run for ms3103
 *   bun scripts/backfill-question-images-to-r2.ts --apply         # Apply changes
 *   bun scripts/backfill-question-images-to-r2.ts --course=ms3103 --apply
 */

import { parseArgs } from "node:util";
import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { soal, pembahasanSoal, aiQuestionBank } from "@/db/schema";
import { offloadBase64ImagesToR2, offloadQuestionItemImages } from "@/lib/question-images";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    apply: { type: "boolean", default: false },
    course: { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});

const isApply = Boolean(values.apply);
const filterCourse = values.course?.trim();

console.log(`[Backfill Question Images] Mode: ${isApply ? "APPLY (writes to R2 and DB)" : "DRY-RUN (read-only)"}`);
if (filterCourse) {
  console.log(`[Backfill Question Images] Filter course: ${filterCourse}`);
}

async function run() {
  // 1. Find affected questions in `soal`
  const questionConditions = [
    or(
      like(soal.prompt, "%data:image/%"),
      like(soal.optionsSnapshot, "%data:image/%"),
    ),
  ];

  if (filterCourse) {
    questionConditions.push(eq(soal.mataKuliahId, filterCourse));
  }

  const affectedQuestions = await db
    .select({
      id: soal.id,
      courseId: soal.mataKuliahId,
      sourceQuestionNumber: soal.sourceQuestionNumber,
      prompt: soal.prompt,
      optionsSnapshot: soal.optionsSnapshot,
    })
    .from(soal)
    .where(and(...questionConditions));

  console.log(`\nFound ${affectedQuestions.length} questions in 'soal' containing base64 images.`);

  let totalQuestionsSavedBytes = 0;
  let questionsUpdated = 0;

  for (const q of affectedQuestions) {
    const originalPromptBytes = Buffer.byteLength(q.prompt, "utf8");
    const originalOptionsStr = JSON.stringify(q.optionsSnapshot ?? []);
    const originalOptionsBytes = Buffer.byteLength(originalOptionsStr, "utf8");

    if (isApply) {
      const offloaded = await offloadQuestionItemImages(
        {
          prompt: q.prompt,
          options: q.optionsSnapshot,
        },
        {
          courseSlug: q.courseId,
          questionIdentifier: q.sourceQuestionNumber || q.id,
        },
      );

      const newPromptBytes = Buffer.byteLength(offloaded.prompt, "utf8");
      const newOptionsBytes = Buffer.byteLength(JSON.stringify(offloaded.options ?? []), "utf8");
      const savedBytes = (originalPromptBytes + originalOptionsBytes) - (newPromptBytes + newOptionsBytes);

      await db
        .update(soal)
        .set({
          prompt: offloaded.prompt,
          optionsSnapshot: offloaded.options as any,
          updatedAt: new Date(),
        })
        .where(eq(soal.id, q.id));

      const optionsForAiBank = Array.isArray(offloaded.options)
        ? offloaded.options.map((opt: unknown) => {
            if (typeof opt === "string") return opt;
            if (opt && typeof opt === "object" && "text" in opt && typeof (opt as { text: unknown }).text === "string") {
              return (opt as { text: string }).text;
            }
            return String(opt ?? "");
          })
        : [];

      // Mirror to aiQuestionBank if present
      await db
        .update(aiQuestionBank)
        .set({
          prompt: offloaded.prompt,
          options: optionsForAiBank,
        })
        .where(eq(aiQuestionBank.id, q.id));

      totalQuestionsSavedBytes += Math.max(0, savedBytes);
      questionsUpdated++;
      console.log(`  [APPLIED] Soal ${q.id} (${q.courseId}): saved ~${(savedBytes / 1024).toFixed(1)} KB`);
    } else {
      const matchCount = (q.prompt.match(/data:image\//g) || []).length;
      console.log(`  [DRY-RUN] Soal ${q.id} (${q.courseId}): ~${matchCount} image(s), prompt size ${(originalPromptBytes / 1024).toFixed(1)} KB`);
    }
  }

  // 2. Find affected explanations in `pembahasan_soal`
  const affectedSolutions = await db
    .select({
      id: pembahasanSoal.id,
      soalId: pembahasanSoal.soalId,
      content: pembahasanSoal.content,
    })
    .from(pembahasanSoal)
    .where(like(pembahasanSoal.content, "%data:image/%"));

  console.log(`\nFound ${affectedSolutions.length} explanations in 'pembahasan_soal' containing base64 images.`);

  let solutionsUpdated = 0;
  let totalSolutionsSavedBytes = 0;

  for (const sol of affectedSolutions) {
    const originalBytes = Buffer.byteLength(sol.content, "utf8");

    if (isApply) {
      // Find course for this soal
      const [parentSoal] = await db
        .select({ courseId: soal.mataKuliahId })
        .from(soal)
        .where(eq(soal.id, sol.soalId))
        .limit(1);

      const courseSlug = parentSoal?.courseId || filterCourse || "general";
      const offloadedContent = await offloadBase64ImagesToR2(sol.content, {
        courseSlug,
        questionIdentifier: `${sol.soalId}-solution`,
      });

      const newBytes = Buffer.byteLength(offloadedContent, "utf8");
      const savedBytes = originalBytes - newBytes;

      await db
        .update(pembahasanSoal)
        .set({
          content: offloadedContent,
          updatedAt: new Date(),
        })
        .where(eq(pembahasanSoal.id, sol.id));

      // Mirror explanation to aiQuestionBank if present
      await db
        .update(aiQuestionBank)
        .set({
          explanation: offloadedContent,
        })
        .where(eq(aiQuestionBank.id, sol.soalId));

      totalSolutionsSavedBytes += Math.max(0, savedBytes);
      solutionsUpdated++;
      console.log(`  [APPLIED] Pembahasan ${sol.id}: saved ~${(savedBytes / 1024).toFixed(1)} KB`);
    } else {
      const matchCount = (sol.content.match(/data:image\//g) || []).length;
      console.log(`  [DRY-RUN] Pembahasan ${sol.id}: ~${matchCount} image(s), size ${(originalBytes / 1024).toFixed(1)} KB`);
    }
  }

  console.log("\n==========================================");
  if (isApply) {
    console.log(`Finished: ${questionsUpdated} questions and ${solutionsUpdated} solutions updated.`);
    console.log(`Total database payload reduced by ~${((totalQuestionsSavedBytes + totalSolutionsSavedBytes) / 1024).toFixed(1)} KB.`);
  } else {
    console.log(`Dry-run complete. Run with '--apply' to offload images to R2 and update database.`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Backfill Question Images] Error:", err);
    process.exit(1);
  });
