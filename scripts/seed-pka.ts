/**
 * Seeds the Tutorial PKA campaign course scaffolding: the course row, 9 quiz
 * templates (3 subjects x 3 stages), the matching pkaSimulationStages
 * mapping, and a small set of placeholder sample questions per stage so the
 * flow is testable locally without needing the admin AI question-generation
 * pipeline. Real content should be authored via the existing admin AI
 * question-generation tooling (app/(admin)/admin/ai/(eval)/questions,
 * .../quizzes) pointed at PKA_COURSE_ID - the sample questions here are
 * placeholders only.
 *
 * Run: bunx tsx scripts/seed-pka.ts
 */
import "dotenv/config";
import { db } from "../lib/db/index";
import { courses, quizTemplates, aiQuestionBank, pkaSimulationStages } from "../db/schema";
import { PKA_SUBJECTS, PKA_SUBJECT_LABELS, PKA_COURSE_ID, PKA_STAGES, type PkaSubject, type PkaStage } from "../lib/pka-config";

const PASS_SCORE_THRESHOLD = 70;

function sampleQuestions(subject: PkaSubject, stage: PkaStage) {
  const label = PKA_SUBJECT_LABELS[subject];
  const difficulty = stage === 1 ? "easy" : stage === 2 ? "medium" : "hard";
  // Placeholder content only - not real PKA material. Replace via admin AI
  // question-generation tooling once available.
  return Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    const correctValue = (stage + n) * 2;
    return {
      id: `pka-q-${subject}-s${stage}-${n}`,
      prompt: `[Contoh soal ${label} Stage ${stage} #${n}] Berapa hasil dari (${stage} + ${n}) x 2?`,
      options: [String(correctValue), String(correctValue + 1), String(correctValue - 1), String(correctValue + 2)],
      correctIndices: [0],
      explanation: `(${stage} + ${n}) x 2 = ${correctValue}.`,
      difficulty: difficulty as "easy" | "medium" | "hard",
      tags: [`pka-${subject}-stage${stage}`],
    };
  });
}

async function main() {
  console.log("Seeding Tutorial PKA campaign...");

  await db
    .insert(courses)
    .values({
      id: PKA_COURSE_ID,
      title: "Tutorial PKA (Simulasi Gratis)",
      category: "PKA",
      description: "Simulasi gratis Pemetaan Kesiapan Akademik (PKA) ITB - Matematika, Fisika, Kimia.",
    })
    .onConflictDoNothing();

  for (const subject of PKA_SUBJECTS) {
    for (const stage of PKA_STAGES) {
      const templateId = `pka-${subject}-stage${stage}`;
      const label = PKA_SUBJECT_LABELS[subject];

      await db
        .insert(quizTemplates)
        .values({
          id: templateId,
          courseId: PKA_COURSE_ID,
          title: `PKA ${label} - Stage ${stage}`,
          category: "chapter",
          visibility: "free",
          timeLimitSeconds: 900,
          maxAttempts: null,
          selectionRules: { count: 6, tags: [`pka-${subject}-stage${stage}`] },
        })
        .onConflictDoNothing();

      await db
        .insert(pkaSimulationStages)
        .values({
          id: `pka-stage-${subject}-${stage}`,
          subject,
          stage,
          quizTemplateId: templateId,
          passScoreThreshold: PASS_SCORE_THRESHOLD,
        })
        .onConflictDoNothing();

      for (const q of sampleQuestions(subject, stage)) {
        await db
          .insert(aiQuestionBank)
          .values({
            id: q.id,
            courseId: PKA_COURSE_ID,
            status: "active",
            difficulty: q.difficulty,
            questionType: "multiple_choice",
            tags: q.tags,
            prompt: q.prompt,
            options: q.options,
            correctIndices: q.correctIndices,
            explanation: q.explanation,
            reviewStatus: "published",
          })
          .onConflictDoNothing();
      }

      console.log(`  seeded ${label} Stage ${stage} (${templateId})`);
    }
  }

  console.log("Tutorial PKA seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-pka failed:", err);
  process.exit(1);
});
