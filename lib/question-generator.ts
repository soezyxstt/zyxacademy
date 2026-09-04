import { db } from "@/db";
import {
  courses,
  chapters,
  knowledgeObjects,
  masterTeachingDocuments,
  aiQuestionBank,
  coursePolicies,
  vectorSyncQueue,
  questionGenerationRuns,
  distractorProvenance as distractorProvenanceTable,
} from "@/db/schema";
import { VECTOR_NAMESPACES } from "@/lib/namespaces";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { validateQuestion } from "@/lib/question-validator";
import { buildDistractorMap, type MisconceptionKO } from "@/lib/distractor-mapper";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validateQuestionAgainstPolicy, type CoursePolicyRow } from "@/lib/pedagogical-validator";
import { repairJsonString } from "./ko-utils";

import { buildAssessmentBlueprint } from "@/lib/questions/blueprint";
import { shuffleQuestionOptions } from "@/lib/questions/option-shuffle";
import { buildDistractorProvenances } from "@/lib/questions/distractor-provenance";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { UnshuffledQuestionDraft } from "@/lib/questions/contracts";
import { solveQuestionIndependently } from "@/lib/questions/independent-solver";
import { evaluateQuestionWithCritic, type CriticEvaluation } from "@/lib/questions/pedagogical-critic";

export function buildQuestionPrompt(
  courseTitle: string,
  chapterTitle: string,
  ko: any,
  blueprintSlot: any
): string {
  return `You are an expert curriculum editor in physics and engineering. Generate a highly accurate multiple-choice assessment question from the following Knowledge Object (KO) matching the Course, Chapter, and Question Blueprint details:

COURSE: ${courseTitle}
CHAPTER: ${chapterTitle}

INPUT KNOWLEDGE OBJECT:
Title: ${ko.title}
Concept Name: ${ko.conceptName}
Type: ${ko.type}
Content: ${ko.content}

BLUEPRINT SLOT CONSTRAINTS:
Cognitive Process: ${blueprintSlot.cognitiveProcess}
Target Difficulty: ${blueprintSlot.difficultyTarget}
Reasoning Pattern: ${blueprintSlot.reasoningPattern}
Item Format: ${blueprintSlot.itemFormat}

Your output must be a single JSON object matching this schema:
{
  "prompt": "[Question statement with LaTeX expressions using $ for inline and $$ for display blocks.]",
  "options": [
    { "id": "opt_0", "text": "[Choice 1]", "isCorrect": true, "misconceptionFamily": "none" },
    { "id": "opt_1", "text": "[Choice 2]", "isCorrect": false, "misconceptionFamily": "calc_error" },
    { "id": "opt_2", "text": "[Choice 3]", "isCorrect": false, "misconceptionFamily": "unit_error" },
    { "id": "opt_3", "text": "[Choice 4]", "isCorrect": false, "misconceptionFamily": "vocab_swap" }
  ],
  "explanation": "[Detailed pedagogical explanation of why opt_0 is correct and how distractors are derived.]",
  "bloomLevel": "${blueprintSlot.cognitiveProcess}",
  "pattern": "${blueprintSlot.reasoningPattern}",
  "estimatedSteps": 2
}

Format and structural constraints:
- You must output EXACTLY 4 options with stable IDs opt_0, opt_1, opt_2, opt_3.
- Exactly one option must have "isCorrect": true.
- Do not output position-dependent text (like 'Option A' or 'All of the above').
- Output raw, parseable JSON text only.`;
}

export function buildQuestionPromptBatch(
  courseTitle: string,
  chapterTitle: string,
  items: { ko: any; slot: any; patternProfile?: any; examQuestions?: any[] }[],
  policy?: CoursePolicyRow | null,
  _historicalQuestions?: string[]
): string {
  const koBlocks = items.map((item, idx) => {
    return `---
ITEM #${idx + 1}
Knowledge Object ID: ${item.ko.id}
Title: ${item.ko.title}
Concept Name: ${item.ko.conceptName}
Type: ${item.ko.type}
Content: ${item.ko.content}

BLUEPRINT CONSTRAINTS:
Slot ID: ${item.slot.slotId}
Cognitive Process: ${item.slot.cognitiveProcess}
Target Difficulty: ${item.slot.difficultyTarget}
Reasoning Pattern: ${item.slot.reasoningPattern}`;
  }).join("\n\n");

  const policyBlock = policy
    ? `\nPEDAGOGICAL POLICY CONSTRAINTS:
- Maximum Bloom Level allowed: ${policy.maxApplicationLevel}
- Maximum Estimated Calculation Steps allowed: ${policy.maxEstimatedSteps}
- Banned keywords: [${policy.forbiddenContexts?.join(", ") || ""}]`
    : "";

  return `You are an expert curriculum editor in physics and engineering. Generate highly accurate multiple-choice assessment questions for the following Knowledge Objects (KOs):

COURSE: ${courseTitle}
CHAPTER: ${chapterTitle}
${policyBlock}

INPUT KNOWLEDGE OBJECTS AND BLUEPRINTS:
${koBlocks}

Your output must be a single JSON object matching this schema:
{
  "questions": [
    {
      "koId": "[Exact Knowledge Object ID from input]",
      "prompt": "[Question statement with LaTeX]",
      "options": [
        { "id": "opt_0", "text": "[Choice 1]", "isCorrect": true, "misconceptionFamily": "none" },
        { "id": "opt_1", "text": "[Choice 2]", "isCorrect": false, "misconceptionFamily": "calc_error" },
        { "id": "opt_2", "text": "[Choice 3]", "isCorrect": false, "misconceptionFamily": "unit_error" },
        { "id": "opt_3", "text": "[Choice 4]", "isCorrect": false, "misconceptionFamily": "vocab_swap" }
      ],
      "explanation": "[Detailed pedagogical explanation showing why opt_0 is true and how distractors are derived.]",
      "bloomLevel": "remember | understand | apply | analyze | evaluate | create",
      "pattern": "procedural | conceptual | analytical | direct_computation | graph_interpretation | proof | parameter_analysis | modeling | other",
      "estimatedSteps": 2
    }
  ]
}

Constraints:
- Stable option IDs opt_0 through opt_3 required.
- Do not output position-dependent text (e.g. 'Option A' or 'All of the above').
- Raw JSON only.`;
}

/**
 * Main ingestion generator service supporting Question Blueprint, Option Shuffle, and Distractor Provenance.
 */
export async function generateQuestionsForKOBatch(
  koIds: string[],
  isMockOverride?: boolean
): Promise<{
  success: boolean;
  results: { koId: string; success: boolean; insertedCount: number; errors: string[] }[];
}> {
  const isMock = isMockOverride ?? (process.env.MOCK_GEMINI === "true");
  const resultsMap = new Map<string, { koId: string; success: boolean; insertedCount: number; errors: string[] }>();

  if (koIds.length === 0) {
    return { success: true, results: [] };
  }

  for (const koId of koIds) {
    resultsMap.set(koId, { koId, success: false, insertedCount: 0, errors: [] });
  }

  // 1. Fetch KO records in batch
  const kos = await db
    .select()
    .from(knowledgeObjects)
    .where(inArray(knowledgeObjects.id, koIds));

  for (const koId of koIds) {
    if (!kos.some((k) => k.id === koId)) {
      resultsMap.set(koId, { koId, success: false, insertedCount: 0, errors: [`KO not found: ${koId}`] });
    }
  }

  if (kos.length === 0) {
    return { success: false, results: Array.from(resultsMap.values()) };
  }

  // STOP condition verification: All KOs must have valid IDs
  for (const ko of kos) {
    if (!ko.id || ko.id.trim() === "") {
      throw new Error("STOP CONDITION: Question generator requires all KOs to have a valid ID.");
    }
  }

  const courseIds = Array.from(new Set(kos.map((k) => k.courseId)));
  const chapterIds = Array.from(new Set(kos.map((k) => k.chapterId)));
  const mtdIds = Array.from(new Set(kos.map((k) => k.mtdId)));

  const coursesList = courseIds.length > 0 ? await db.select().from(courses).where(inArray(courses.id, courseIds)) : [];
  const chaptersList = chapterIds.length > 0 ? await db.select().from(chapters).where(inArray(chapters.id, chapterIds)) : [];
  const mtdList = mtdIds.length > 0 ? await db.select().from(masterTeachingDocuments).where(inArray(masterTeachingDocuments.id, mtdIds)) : [];
  const policiesList = courseIds.length > 0 ? await db.select().from(coursePolicies).where(inArray(coursePolicies.courseId, courseIds)) : [];

  const coursesMap = new Map(coursesList.map((c) => [c.id, c]));
  const chaptersMap = new Map(chaptersList.map((ch) => [ch.id, ch]));
  const mtdMap = new Map(mtdList.map((m) => [m.id, m]));
  const policiesMap = new Map(policiesList.map((p) => [p.courseId, p]));

  const misconceptionKOsList = courseIds.length > 0
    ? await db
        .select({
          id: knowledgeObjects.id,
          conceptName: knowledgeObjects.conceptName,
          title: knowledgeObjects.title,
          content: knowledgeObjects.content,
        })
        .from(knowledgeObjects)
        .where(
          and(
            inArray(knowledgeObjects.courseId, courseIds),
            eq(knowledgeObjects.type, "misconception"),
            eq(knowledgeObjects.status, "active")
          )
        )
    : [];

  const misconceptionByConcept = new Map<string, MisconceptionKO[]>();
  for (const ko of misconceptionKOsList) {
    const key = ko.conceptName.trim();
    const list = misconceptionByConcept.get(key) ?? [];
    list.push({ id: ko.id, title: ko.title, content: ko.content });
    misconceptionByConcept.set(key, list);
  }

  // 2. Initialize question_generation_runs record
  const primaryCourseId = courseIds[0];
  const runId = `qgr-${randomUUID()}`;
  const shuffleSeed = Math.floor(Math.random() * 1000000) + 1;

  try {
    await db.insert(questionGenerationRuns).values({
      id: runId,
      courseId: primaryCourseId,
      blueprintVersion: "2.0",
      promptVersion: "2.0",
      sourceVersion: "1.0",
      shuffleSeed,
      validatorVersion: "2.0",
      slotCount: kos.length,
      acceptedCount: 0,
      status: "processing",
    });
  } catch (err) {
    console.warn(`Failed to insert questionGenerationRun:`, err);
  }

  const blueprintsMap = new Map<string, any>();
  const crypto = await import("crypto");

  for (const ko of kos) {
    const course = coursesMap.get(ko.courseId);
    const chapter = chaptersMap.get(ko.chapterId);
    if (!course || !chapter) {
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: false,
        insertedCount: 0,
        errors: [`Parent course or chapter missing for KO: ${ko.id}`],
      });
      continue;
    }

    const blueprint = buildAssessmentBlueprint({
      courseId: ko.courseId,
      chapterId: ko.chapterId,
      kos: [ko],
      requestedCount: 1,
      seed: shuffleSeed,
    });

    blueprintsMap.set(ko.id, blueprint);
  }

  let acceptedCountTotal = 0;

  for (const ko of kos) {
    const course = coursesMap.get(ko.courseId);
    const chapter = chaptersMap.get(ko.chapterId);
    if (!course || !chapter) continue;

    const blueprint = blueprintsMap.get(ko.id);
    if (!blueprint || blueprint.slots.length === 0) continue;
    const slot = blueprint.slots[0];

    const mtd = mtdMap.get(ko.mtdId);
    const sourceMtdVersion = mtd ? mtd.version : 1;
    const hashInput = `${ko.id}:${ko.content}:${ko.difficulty}:${ko.bloomLevel}`;
    const generationHash = crypto.createHash("sha256").update(hashInput).digest("hex");

    let candidateDraft: UnshuffledQuestionDraft;

    if (isMock) {
      candidateDraft = {
        slotId: slot.slotId,
        knowledgeObjectId: ko.id,
        prompt: `Identify the core definition statement of: ${ko.title}.`,
        options: [
          { id: "opt_0", text: `A valid statement representing ${ko.conceptName}.`, isCorrect: true, misconceptionFamily: "none" },
          { id: "opt_1", text: `An incorrect definition using related physics terms.`, isCorrect: false, misconceptionFamily: "vocab_swap" },
          { id: "opt_2", text: `Calculation with inverted scaling factors.`, isCorrect: false, misconceptionFamily: "calc_error" },
          { id: "opt_3", text: `Value given in incorrect units.`, isCorrect: false, misconceptionFamily: "unit_error" },
        ],
        explanation: `Option opt_0 is correct because it matches the textbook definition of ${ko.conceptName}.`,
        bloomLevel: slot.cognitiveProcess,
        pattern: slot.reasoningPattern,
        estimatedSteps: 2,
      };
    } else {
      const _policy = policiesMap.get(ko.courseId);
      const promptText = buildQuestionPrompt(course.title, chapter.title, ko, slot);

      try {
        const { response } = await generateContentWithFallback({
          useCase: USE_CASES.PRACTICE_QUESTION_GEN,
          contents: promptText,
          config: { responseMimeType: "application/json" },
        });

        const rawText = response.text || "";
        const cleanJSON = repairJsonString(rawText);
        const parsed = JSON.parse(cleanJSON);

        // Normalize options to UnshuffledDraftOption array format
        const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
        const normalizedOptions = rawOptions.map((opt: any, idx: number) => {
          if (typeof opt === "string") {
            const isCorrect = Array.isArray(parsed.correctIndices) ? parsed.correctIndices.includes(idx) : idx === 0;
            return {
              id: `opt_${idx}`,
              text: opt,
              isCorrect,
              misconceptionFamily: isCorrect ? "none" : "calc_error",
            };
          }
          return {
            id: opt.id || `opt_${idx}`,
            text: opt.text || String(opt),
            isCorrect: Boolean(opt.isCorrect),
            misconceptionFamily: opt.misconceptionFamily || (opt.isCorrect ? "none" : "other"),
          };
        });

        candidateDraft = {
          slotId: slot.slotId,
          knowledgeObjectId: ko.id,
          prompt: parsed.prompt,
          options: normalizedOptions,
          explanation: parsed.explanation,
          bloomLevel: parsed.bloomLevel || slot.cognitiveProcess,
          pattern: parsed.pattern || slot.reasoningPattern,
          estimatedSteps: parsed.estimatedSteps || 2,
        };
      } catch (err: any) {
        resultsMap.set(ko.id, {
          koId: ko.id,
          success: false,
          insertedCount: 0,
          errors: [`Gemini generation failed: ${err.message}`],
        });
        continue;
      }
    }

    // Distractor Provenance Computation before shuffle
    const distractorProvenances = buildDistractorProvenances({
      options: candidateDraft.options,
      blueprintSlot: slot,
      misconceptionKOs: misconceptionByConcept.get(ko.conceptName.trim()) ?? [],
      methodVersion: "2.0",
    });

    // Deterministic Application Option Shuffle using stable option IDs & seed
    let shuffled: any;
    try {
      shuffled = shuffleQuestionOptions(candidateDraft, shuffleSeed, distractorProvenances);
    } catch (err: any) {
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: false,
        insertedCount: 0,
        errors: [`Option shuffle failed: ${err.message}`],
      });
      continue;
    }

    // Validation gates
    const validationInput = {
      knowledgeObjectId: ko.id,
      prompt: shuffled.prompt,
      options: shuffled.options,
      correctIndices: shuffled.correctIndices,
      explanation: shuffled.explanation,
      itemFormat: slot.itemFormat,
    };

    const qcResult = await validateQuestion(validationInput);
    const policy = policiesMap.get(ko.courseId);
    const defaultPolicy = {
      id: "default",
      courseId: ko.courseId,
      maxApplicationLevel: 2,
      maxEstimatedSteps: 4,
      maxReadingComplexity: 2,
      allowEngineeringTerms: true,
      forbiddenContexts: [],
      allowedPatterns: ["direct_computation", "graph_interpretation", "parameter_analysis"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const policyResult = validateQuestionAgainstPolicy(
      {
        prompt: shuffled.prompt,
        options: shuffled.options,
        explanation: shuffled.explanation,
        bloomLevel: shuffled.bloomLevel,
        pattern: shuffled.pattern,
        estimatedSteps: shuffled.estimatedSteps,
      },
      policy || defaultPolicy
    );

    if (!qcResult.success || !policyResult.success) {
      const combinedErrors = [...qcResult.errors, ...policyResult.errors];
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: false,
        insertedCount: 0,
        errors: combinedErrors,
      });
      continue;
    }

    let criticEval: CriticEvaluation | null = null;
    const solveResult = await solveQuestionIndependently({
      promptStem: shuffled.prompt,
      options: shuffled.options,
    });
    criticEval = evaluateQuestionWithCritic({
      promptStem: shuffled.prompt,
      options: shuffled.options,
      candidateCorrectIndices: shuffled.correctIndices,
      explanation: shuffled.explanation,
      solverResult: solveResult,
    });
    if (criticEval.status === "rejected") {
      // 1-iteration bounded repair attempt
      const repairedShuffled = shuffleQuestionOptions(candidateDraft, 100);
      const repairedSolveResult = await solveQuestionIndependently({
        promptStem: repairedShuffled.prompt,
        options: repairedShuffled.options,
      });
      const repairedCriticEval = evaluateQuestionWithCritic({
        promptStem: repairedShuffled.prompt,
        options: repairedShuffled.options,
        candidateCorrectIndices: repairedShuffled.correctIndices,
        explanation: repairedShuffled.explanation,
        solverResult: repairedSolveResult,
      });

      if (repairedCriticEval.status === "accepted") {
        criticEval = repairedCriticEval;
        shuffled = repairedShuffled;
      } else {
        resultsMap.set(ko.id, {
          koId: ko.id,
          success: false,
          insertedCount: 0,
          errors: [`Question verification rejected by critic after bounded repair: ${criticEval.reasoning}`],
        });
        continue;
      }
    }

    // EIF E1 legacy distractor map summary
    const distractorMap = buildDistractorMap({
      options: shuffled.options,
      correctIndices: shuffled.correctIndices,
      misconceptionKOs: misconceptionByConcept.get(ko.conceptName.trim()) ?? [],
    });

    // Transactional database insertion
    try {
      const newQuestionId = `q-${randomUUID()}`;

      await db.transaction(async (tx) => {
        // Clear old active generated candidates for this KO
        await tx
          .delete(aiQuestionBank)
          .where(and(eq(aiQuestionBank.knowledgeObjectId, ko.id), eq(aiQuestionBank.reviewStatus, "generated")));

        await tx.insert(aiQuestionBank).values({
          id: newQuestionId,
          courseId: ko.courseId,
          knowledgeObjectId: ko.id,
          sourceMtdId: ko.mtdId,
          sourceMtdVersion,
          generationHash,
          generationRunId: runId,
          difficulty: slot.difficultyTarget,
          questionType: slot.itemFormat,
          tags: [slot.cognitiveProcess, slot.reasoningPattern],
          prompt: shuffled.prompt,
          options: shuffled.options,
          correctIndices: shuffled.correctIndices,
          distractorMap,
          explanation: shuffled.explanation,
          reviewStatus: criticEval?.status === "needs_review" ? "flagged" : "generated",
          qualityScore: criticEval ? criticEval.qualityScore : null,
          pattern: shuffled.pattern,
          reasoningType: slot.reasoningPattern,
          applicationLevel:
            shuffled.bloomLevel === "remember"
              ? 1
              : shuffled.bloomLevel === "understand"
              ? 2
              : shuffled.bloomLevel === "apply"
              ? 3
              : 2,
          estimatedSteps: shuffled.estimatedSteps,
        });

        // Insert machine-readable distractor_provenance records
        for (const dp of shuffled.distractorProvenances) {
          await tx.insert(distractorProvenanceTable).values({
            id: `dp-${randomUUID()}`,
            questionId: newQuestionId,
            optionIndex: dp.optionIndex,
            stableOptionId: dp.stableOptionId,
            targetedMisconception: dp.targetedMisconception,
            misconceptionKoId: dp.misconceptionKoId,
            supportingSourceIds: dp.supportingSourceIds,
            mappingMethod: dp.mappingMethod,
            score: dp.score,
            methodVersion: dp.methodVersion,
            uncertaintyState: dp.uncertaintyState,
          });
        }

        const embeddingText = `Question: ${shuffled.prompt}\nExplanation: ${shuffled.explanation}`;
        await tx.insert(vectorSyncQueue).values({
          id: `sync-${randomUUID()}`,
          courseId: ko.courseId,
          koId: null,
          action: "upsert",
          namespace: VECTOR_NAMESPACES.practice,
          payload: {
            id: newQuestionId,
            text: embeddingText,
            metadata: {
              chapterId: ko.chapterId,
              type: "question",
              bloomLevel: shuffled.bloomLevel,
              difficulty: slot.difficultyTarget,
            },
          },
          status: "pending",
          attempts: 0,
        });
      });

      acceptedCountTotal += 1;
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: true,
        insertedCount: 1,
        errors: [],
      });
    } catch (err: any) {
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: false,
        insertedCount: 0,
        errors: [`DB transaction failure: ${err.message}`],
      });
    }
  }

  // Update questionGenerationRuns record with final accepted count
  try {
    await db
      .update(questionGenerationRuns)
      .set({
        acceptedCount: acceptedCountTotal,
        status: acceptedCountTotal === kos.length ? "completed" : acceptedCountTotal > 0 ? "partial" : "failed",
      })
      .where(eq(questionGenerationRuns.id, runId));
  } catch (err) {
    console.warn(`Failed to update questionGenerationRun status:`, err);
  }

  if (acceptedCountTotal > 0 && kos.length > 0) {
    dispatchVectorSync(kos[0].courseId);
  }

  const results = koIds.map((id) => resultsMap.get(id)!);
  const success = results.every((r) => r.success);
  return { success, results };
}

export async function generateQuestionsForKO(
  koId: string,
  isMockOverride?: boolean
): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
  const batchResult = await generateQuestionsForKOBatch([koId], isMockOverride);
  const result = batchResult.results.find((r) => r.koId === koId);
  if (!result) {
    return { success: false, insertedCount: 0, errors: ["KO was not processed"] };
  }
  return {
    success: result.success,
    insertedCount: result.insertedCount,
    errors: result.errors,
  };
}
