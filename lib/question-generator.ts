import { db } from "@/db";
import {
  courses,
  chapters,
  knowledgeObjects,
  masterTeachingDocuments,
  aiQuestionBank,
  coursePolicies,
  vectorSyncQueue,
  assessmentObjects,
  assessmentObjectConcepts,
} from "@/db/schema";
import { VECTOR_NAMESPACES } from "@/lib/namespaces";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { generateBlueprintForKO } from "@/lib/question-blueprint-engine";
import { validateQuestion } from "@/lib/question-validator";
import { buildDistractorMap, type MisconceptionKO } from "@/lib/distractor-mapper";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validateQuestionAgainstPolicy, type CoursePolicyRow } from "@/lib/pedagogical-validator";
import { getPatternProfile } from "./assessment-pattern-engine";

// Zod validation helper for Gemini response parsing
import { repairJsonString } from "./ko-utils";

/**
 * Builds the dynamic prompt mapping blueprint requirements and distractor strategies to Gemini context.
 */
export function buildQuestionPrompt(
  courseTitle: string,
  chapterTitle: string,
  ko: any,
  blueprint: any
): string {
  return `You are an expert curriculum editor in physics and engineering. Generate a highly accurate multiple-choice assessment question from the following Knowledge Object (KO) matching the Course, Chapter, and Question Blueprint details:

COURSE: ${courseTitle}
CHAPTER: ${chapterTitle}

INPUT KNOWLEDGE OBJECT:
Title: ${ko.title}
Concept Name: ${ko.conceptName}
Type: ${ko.type}
Content: ${ko.content}

BLUEPRINT CONSTRAINTS:
Blueprint Type: ${blueprint.blueprintType}
Bloom Cognitive Level: ${blueprint.bloomLevel}
Target Difficulty: ${blueprint.targetDifficulty}
Distractor Strategy: ${blueprint.distractorStrategy}
Math/LaTeX Constraints: ${blueprint.mathConstraints}
Tags: ${blueprint.tags.join(", ")}

Your output must be a single JSON object matching this schema:
{
  "prompt": "[Question statement. Embed clear LaTeX expressions using $ for inline and $$ for display blocks. Formulate problem context clearly.]",
  "options": [
    "[Option A string containing choice value or formula]",
    "[Option B string containing choice value or formula]",
    "[Option C string containing choice value or formula]",
    "[Option D string containing choice value or formula]"
  ],
  "correctIndices": [0],
  "explanation": "[Detailed pedagogical explanation showing why the correct option is true and how the distractors are derived or why they are incorrect. Keep explanation comprehensive.]"
}

Format and structural constraints:
- You must output EXACTLY 4 options.
- The correctIndices array must only reference valid indexes between 0 and 3.
- Avoid duplicate choice text strings.
- LaTeX delimiters ($ for inline, $$ for block display) must be syntactically correct and renderable by KaTeX.
- Do not output markdown code fences (like \`\`\`json). Output raw, parseable JSON text only.
- Do not add any provenance details or metadata blocks inside the explanation. The system will handle provenance tracking automatically.`;
}

/**
 * Builds the batch prompt mapping blueprint requirements for multiple KOs.
 */
export function buildQuestionPromptBatch(
  courseTitle: string,
  chapterTitle: string,
  items: { ko: any; blueprint: any; patternProfile?: any; examQuestions?: any[] }[],
  policy?: CoursePolicyRow | null,
  historicalQuestions?: string[]
): string {
  const koBlocks = items.map((item, idx) => {
    const patternProfileBlock = item.patternProfile && item.patternProfile.totalQuestionsCount > 0
      ? `\nHISTORICAL EXAM SEBARAN DISTRIBUSI (Align with these style balances if possible):
- Target Pattern Mix: ${JSON.stringify(item.patternProfile.patternDistribution)}
- Target Reasoning Mix: ${JSON.stringify(item.patternProfile.reasoningDistribution)}
- Target Difficulty Mix: ${JSON.stringify(item.patternProfile.difficultyDistribution)}
- Target Avg Steps: ${item.patternProfile.averageEstimatedSteps} langkah
- Target Bloom Level: Level ${item.patternProfile.averageApplicationLevel}`
      : "";

    const examQuestionsBlock = item.examQuestions && item.examQuestions.length > 0
      ? `\nCONTOH SOAL UTS/UAS HISTORIS (Analyze their style/wording, but DO NOT clone or copy their scenarios/values):
${item.examQuestions.map((eq, i) => `Contoh ${i + 1} (Pattern: ${eq.pattern}): "${eq.questionMarkdown}"`).join("\n")}`
      : "";

    return `---
ITEM #${idx + 1}
Knowledge Object ID: ${item.ko.id}
Title: ${item.ko.title}
Concept Name: ${item.ko.conceptName}
Type: ${item.ko.type}
Content: ${item.ko.content}

BLUEPRINT CONSTRAINTS:
Blueprint Type: ${item.blueprint.blueprintType}
Bloom Cognitive Level: ${item.blueprint.bloomLevel}
Target Difficulty: ${item.blueprint.targetDifficulty}
Distractor Strategy: ${item.blueprint.distractorStrategy}
Math/LaTeX Constraints: ${item.blueprint.mathConstraints}
Tags: ${item.blueprint.tags.join(", ")}${patternProfileBlock}${examQuestionsBlock}`;
  }).join("\n\n");

  const policyBlock = policy
    ? `\nPEDAGOGICAL POLICY CONSTRAINTS (Strictly adhere to these):
- Maximum Bloom Level allowed: ${policy.maxApplicationLevel}
- Maximum Estimated Calculation Steps allowed: ${policy.maxEstimatedSteps}
- Banned/Forbidden keywords or context (DO NOT use or mention these words): [${policy.forbiddenContexts?.join(", ") || ""}]
- Approved question patterns: [${policy.allowedPatterns?.join(", ") || ""}]`
    : "";

  const historicalBlock = historicalQuestions && historicalQuestions.length > 0
    ? `\nHISTORICAL QUESTIONS (Do NOT duplicate the phrasing or style of these questions):
${historicalQuestions.map((q, i) => `Question ${i + 1}: "${q}"`).join("\n")}`
    : "";

  return `You are an expert curriculum editor in physics and engineering. Generate highly accurate multiple-choice assessment questions for the following list of Knowledge Objects (KOs) matching the Course, Chapter, and Question Blueprint details:

COURSE: ${courseTitle}
CHAPTER: ${chapterTitle}
${policyBlock}
${historicalBlock}

INPUT KNOWLEDGE OBJECTS AND BLUEPRINTS:
${koBlocks}

Your output must be a single JSON object matching this schema:
{
  "questions": [
    {
      "koId": "[Exact Knowledge Object ID from the input]",
      "prompt": "[Question statement. Embed clear LaTeX expressions using $ for inline and $$ for display blocks. Formulate problem context clearly.]",
      "options": [
        "[Option A string containing choice value or formula]",
        "[Option B string containing choice value or formula]",
        "[Option C string containing choice value or formula]",
        "[Option D string containing choice value or formula]"
      ],
      "correctIndices": [0],
      "explanation": "[Detailed pedagogical explanation showing why the correct option is true and how the distractors are derived or why they are incorrect. Keep explanation comprehensive.]",
      "bloomLevel": "remember | understand | apply | analyze | evaluate | create",
      "pattern": "direct_computation | graph_interpretation | proof | parameter_analysis | modeling",
      "reasoningType": "procedural | conceptual | analytical",
      "estimatedSteps": [Integer]
    }
  ]
}

Format and structural constraints for each generated question:
- The "koId" field must match the corresponding input Knowledge Object ID exactly.
- You must output EXACTLY 4 options for each question.
- The correctIndices array must only reference valid indexes between 0 and 3.
- Avoid duplicate choice text strings.
- LaTeX delimiters ($ for inline, $$ for block display) must be syntactically correct and renderable by KaTeX.
- Do not output markdown code fences (like \`\`\`json). Output raw, parseable JSON text only.
- Do not add any provenance details or metadata blocks inside the explanation. The system will handle provenance tracking automatically.`;
}

/**
 * Builds the repair prompt for failed questions inside a batch.
 */
export function buildQuestionRepairPromptBatch(
  failedItems: {
    koId: string;
    courseTitle: string;
    chapterTitle: string;
    koTitle: string;
    koConceptName: string;
    koType: string;
    candidate: any;
    errors: string[];
  }[]
): string {
  const failedBlocks = failedItems.map((f, idx) => {
    return `---
FAILED QUESTION #${idx + 1}
Knowledge Object ID: ${f.koId}
Title: ${f.koTitle}
Concept Name: ${f.koConceptName}
Type: ${f.koType}

YOUR INVALID GENERATED RESPONSE WAS:
${JSON.stringify(f.candidate)}

THE SPECIFIC VALIDATION ERRORS ARE:
${f.errors.join("\n")}`;
  }).join("\n\n");

  return `You generated multiple-choice assessment questions that failed our strict pedagogical quality gates.
Please correct only the failed questions below:

${failedBlocks}

Your output must be a single JSON object matching this schema:
{
  "questions": [
    {
      "koId": "[Exact Knowledge Object ID from the input]",
      "prompt": "[Corrected question statement. Embed clear LaTeX expressions using $ for inline and $$ for display blocks.]",
      "options": [
        "[Corrected Option A]",
        "[Corrected Option B]",
        "[Corrected Option C]",
        "[Corrected Option D]"
      ],
      "correctIndices": [0],
      "explanation": "[Corrected detailed pedagogical explanation showing why the correct option is true and how distractors are derived.]",
      "bloomLevel": "remember | understand | apply | analyze | evaluate | create",
      "pattern": "direct_computation | graph_interpretation | proof | parameter_analysis | modeling",
      "estimatedSteps": [Integer]
    }
  ]
}

Please output corrected, fully compliant questions satisfying all constraints (especially KaTeX rendering equations, options size of exactly 4, unique option values, and valid correctIndices array).`;
}

/**
 * Main ingestion generator service.
 * Handles database transaction states, cardinality rules, overwrite locks, and validation loops in batch.
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

  // Initialize resultsMap with defaults
  for (const koId of koIds) {
    resultsMap.set(koId, { koId, success: false, insertedCount: 0, errors: [] });
  }

  // 1. Fetch KO records in batch
  const kos = await db
    .select()
    .from(knowledgeObjects)
    .where(inArray(knowledgeObjects.id, koIds));

  // Mark KOs that are not found as errors
  for (const koId of koIds) {
    if (!kos.some(k => k.id === koId)) {
      resultsMap.set(koId, { koId, success: false, insertedCount: 0, errors: [`KO not found: ${koId}`] });
    }
  }

  if (kos.length === 0) {
    return { success: false, results: Array.from(resultsMap.values()) };
  }

  // 2. Fetch parent courses, chapters, mtds, policies, and historical questions in batch
  const courseIds = Array.from(new Set(kos.map(k => k.courseId)));
  const chapterIds = Array.from(new Set(kos.map(k => k.chapterId)));
  const mtdIds = Array.from(new Set(kos.map(k => k.mtdId)));

  const coursesList = courseIds.length > 0 ? await db.select().from(courses).where(inArray(courses.id, courseIds)) : [];
  const chaptersList = chapterIds.length > 0 ? await db.select().from(chapters).where(inArray(chapters.id, chapterIds)) : [];
  const mtdList = mtdIds.length > 0 ? await db.select().from(masterTeachingDocuments).where(inArray(masterTeachingDocuments.id, mtdIds)) : [];
  const policiesList = courseIds.length > 0 ? await db.select().from(coursePolicies).where(inArray(coursePolicies.courseId, courseIds)) : [];
  const allHistoricalList = courseIds.length > 0
    ? await db
        .select({ courseId: aiQuestionBank.courseId, prompt: aiQuestionBank.prompt })
        .from(aiQuestionBank)
        .where(and(inArray(aiQuestionBank.courseId, courseIds), eq(aiQuestionBank.status, "active")))
        .limit(30)
    : [];

  const coursesMap = new Map(coursesList.map(c => [c.id, c]));
  const chaptersMap = new Map(chaptersList.map(c => [c.id, c]));
  const mtdMap = new Map(mtdList.map(m => [m.id, m]));
  const policiesMap = new Map(policiesList.map(p => [p.courseId, p]));
  const historicalMap = new Map<string, string[]>();
  for (const hQ of allHistoricalList) {
    const list = historicalMap.get(hQ.courseId) || [];
    list.push(hQ.prompt);
    historicalMap.set(hQ.courseId, list);
  }

  // E1: misconception KOs per concept, for deterministic distractor tagging.
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
            eq(knowledgeObjects.status, "active"),
          ),
        )
    : [];
  const misconceptionByConcept = new Map<string, MisconceptionKO[]>();
  for (const ko of misconceptionKOsList) {
    const key = ko.conceptName.trim();
    const list = misconceptionByConcept.get(key) ?? [];
    list.push({ id: ko.id, title: ko.title, content: ko.content });
    misconceptionByConcept.set(key, list);
  }

  // 3. Fetch existing questions to evaluate cardinality rules in batch
  const existingQuestions = await db
    .select()
    .from(aiQuestionBank)
    .where(
      and(
        inArray(aiQuestionBank.knowledgeObjectId, kos.map(k => k.id)),
        eq(aiQuestionBank.status, "active")
      )
    );

  const existingQuestionsMap = new Map<string, typeof existingQuestions>();
  for (const eqQ of existingQuestions) {
    if (eqQ.knowledgeObjectId) {
      const list = existingQuestionsMap.get(eqQ.knowledgeObjectId) || [];
      list.push(eqQ);
      existingQuestionsMap.set(eqQ.knowledgeObjectId, list);
    }
  }

  const kosToProcess: typeof kos = [];
  const crypto = await import("crypto");
  const blueprintsMap = new Map<string, any>();
  const hashesMap = new Map<string, string>();
  const mtdVersionsMap = new Map<string, number>();

  for (const ko of kos) {
    const course = coursesMap.get(ko.courseId);
    const chapter = chaptersMap.get(ko.chapterId);
    if (!course || !chapter) {
      resultsMap.set(ko.id, {
        koId: ko.id,
        success: false,
        insertedCount: 0,
        errors: [`Parent course or chapter records missing for KO: ${ko.id}`],
      });
      continue;
    }

    const mtd = mtdMap.get(ko.mtdId);
    const sourceMtdVersion = mtd ? mtd.version : 1;
    mtdVersionsMap.set(ko.id, sourceMtdVersion);

    // Compute state hashes for staleness auditing
    const hashInput = `${ko.id}:${ko.content}:${ko.difficulty}:${ko.bloomLevel}`;
    const generationHash = crypto.createHash("sha256").update(hashInput).digest("hex");
    hashesMap.set(ko.id, generationHash);

    // Question Cardinality Strategy audits
    const existing = existingQuestionsMap.get(ko.id) || [];
    const lockedQuestions = existing.filter(
      q => q.reviewStatus === "reviewed" || q.reviewStatus === "published"
    );

    // Ceiling Check: Limit 3 active questions per KO
    if (existing.length >= 3 && lockedQuestions.length > 0) {
      console.log(`[Cardinality Engine] Ceiling of 3 questions reached with locked items for KO: ${ko.id}. Skipping generation.`);
      resultsMap.set(ko.id, { koId: ko.id, success: true, insertedCount: 0, errors: [] });
      continue;
    }

    // Generate Blueprint
    const blueprint = generateBlueprintForKO(ko);
    blueprintsMap.set(ko.id, blueprint);

    kosToProcess.push(ko);
  }

  // Fetch Pattern Profiles and Exam Exemplars for all active KOs to avoid N+1 DB calls
  const patternProfilesMap = new Map<string, any>();
  const examExemplarsMap = new Map<string, any[]>();

  for (const ko of kos) {
    try {
      const profile = await getPatternProfile(ko.conceptId);
      patternProfilesMap.set(ko.id, profile);

      const examQuestions = await db
        .select({
          id: assessmentObjects.id,
          questionMarkdown: assessmentObjects.questionMarkdown,
          options: assessmentObjects.options,
          pattern: assessmentObjects.pattern,
        })
        .from(assessmentObjects)
        .innerJoin(
          assessmentObjectConcepts,
          eq(assessmentObjects.id, assessmentObjectConcepts.assessmentObjectId)
        )
        .where(eq(assessmentObjectConcepts.conceptId, ko.conceptId))
        .limit(2);

      examExemplarsMap.set(ko.id, examQuestions);
    } catch (err) {
      console.warn(`Failed to fetch pattern profile or exemplars for KO ${ko.id}:`, err);
    }
  }

  if (kosToProcess.length === 0) {
    return { success: true, results: Array.from(resultsMap.values()) };
  }

  // 4. Group KOs to process by course and chapter to query Gemini in batches
  const groups = new Map<string, typeof kosToProcess>();
  for (const ko of kosToProcess) {
    const key = `${ko.courseId}:${ko.chapterId}`;
    const list = groups.get(key) || [];
    list.push(ko);
    groups.set(key, list);
  }

  for (const [key, groupKOs] of groups.entries()) {
    const [courseId, chapterId] = key.split(":");
    const course = coursesMap.get(courseId)!;
    const chapter = chaptersMap.get(chapterId)!;

    const items = groupKOs.map(ko => ({
      ko,
      blueprint: blueprintsMap.get(ko.id)!,
      patternProfile: patternProfilesMap.get(ko.id),
      examQuestions: examExemplarsMap.get(ko.id) || [],
    }));

    let candidateBatch: any = null;
    let modelUsedName = "mock-model";

    // 5. Run Mock or Live Gemini Ingestion Loop
    if (isMock) {
      const mockQuestions: any[] = [];
      for (const ko of groupKOs) {
        // Determine mock outputs
        let mockPrompt = `Identify the core definition statement of: ${ko.title}.`;
        let mockOptions = [
          `A valid statement representing ${ko.conceptName}.`,
          `An incorrect definition using related physics vocabulary terms.`,
          `Plausible confusion term option C.`,
          `Plausible confusion term option D.`,
        ];
        let mockCorrect = [0];
        let mockExplanation = `Explanation: Option A is correct because it matches the textbook definition of ${ko.conceptName} specified in the chapter material.`;

        // Trigger validations checks for testing
        if (ko.content.includes("Trigger Broken LaTeX")) {
          mockPrompt = `State equation with bad LaTeX $$\\rho = \\frac{m}{$$`;
        } else if (ko.content.includes("Trigger Bad Index")) {
          mockCorrect = [5];
        } else if (ko.content.includes("Trigger Duplicates")) {
          mockOptions = ["A", "A", "B", "C"];
        } else if (ko.type === "formula") {
          mockPrompt = `State the mathematical expression and application variables for: ${ko.title}. Express variables in standard units.`;
          mockOptions = [
            `$$\\rho = \\frac{m}{V}$$ with $\\rho$ in $kg/m^3$, $m$ in $kg$, $V$ in $m^3$.`,
            `$$\\rho = m \\cdot V$$ with inverted fractions algebra.`,
            `$$\\rho = \\frac{V}{m}$$ with wrong numerator variables.`,
            `$$\\rho = m + V$$ with incorrect addition constants.`,
          ];
          mockCorrect = [0];
          mockExplanation = `Explanation: Density is defined mathematically as mass divided by volume, hence Option A represents the true formulation.`;
        } else if (ko.type === "misconception") {
          mockPrompt = `Identify the misconception regarding: ${ko.title}.`;
          mockOptions = [
            `Weight is the same as normal force under all incline circumstances.`,
            `Normal force depends on surface incline angle $N = m \\cdot g \\cdot \\cos(\\theta)$.`,
            `Normal force is independent of gravity.`,
            `None of the options.`,
          ];
          mockCorrect = [0];
          mockExplanation = `Explanation: The misconception is that normal force is always equal to weight, which is physically false on inclines.`;
        }

        mockQuestions.push({
          koId: ko.id,
          prompt: mockPrompt,
          options: mockOptions,
          correctIndices: mockCorrect,
          explanation: mockExplanation,
        });
      }
      candidateBatch = { questions: mockQuestions };
    } else {
      // Call Live Gemini API
      const policy = policiesMap.get(courseId);
      const historicalQs = historicalMap.get(courseId) || [];
      const userPrompt = buildQuestionPromptBatch(course.title, chapter.title, items, policy, historicalQs);
      
      try {
        const { response, modelUsed } = await generateContentWithFallback({
          useCase: USE_CASES.PRACTICE_QUESTION_GEN,
          contents: userPrompt,
          config: {
            responseMimeType: "application/json",
          },
        });
        
        modelUsedName = modelUsed;
        const rawText = response.text || "";
        if (!rawText.trim()) {
          for (const ko of groupKOs) {
            resultsMap.set(ko.id, { koId: ko.id, success: false, insertedCount: 0, errors: ["Gemini returned empty text response"] });
          }
          continue;
        }

        const cleanJSON = repairJsonString(rawText);
        candidateBatch = JSON.parse(cleanJSON);
      } catch (err: any) {
        for (const ko of groupKOs) {
          resultsMap.set(ko.id, { koId: ko.id, success: false, insertedCount: 0, errors: [`Gemini generation failed: ${err.message}`] });
        }
        continue;
      }
    }

    const generatedQuestions = candidateBatch?.questions || [];
    const candidateMap = new Map<string, any>();
    for (const q of generatedQuestions) {
      if (q && typeof q.koId === "string") {
        candidateMap.set(q.koId, q);
      }
    }

    // 6. Verify QC gates
    const failedQuestionsForRepair: any[] = [];
    const validQuestions = new Map<string, any>();

    for (const ko of groupKOs) {
      const candidate = candidateMap.get(ko.id);
      if (!candidate) {
        resultsMap.set(ko.id, {
          koId: ko.id,
          success: false,
          insertedCount: 0,
          errors: [`Gemini response is missing question for KO: ${ko.id}`],
        });
        continue;
      }

      const blueprint = blueprintsMap.get(ko.id)!;

      const validationInput = {
        knowledgeObjectId: ko.id,
        prompt: candidate.prompt,
        options: candidate.options,
        correctIndices: candidate.correctIndices,
        explanation: candidate.explanation,
      };

      const policy = policiesMap.get(ko.courseId);
      const qcResult = await validateQuestion(validationInput);
      
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
        updatedAt: new Date()
      };
      
      const policyResult = validateQuestionAgainstPolicy({
        prompt: candidate.prompt,
        options: candidate.options,
        explanation: candidate.explanation,
        bloomLevel: candidate.bloomLevel || ko.bloomLevel || "apply",
        pattern: candidate.pattern || blueprint.blueprintType,
        estimatedSteps: candidate.estimatedSteps || 2,
      }, policy || defaultPolicy);

      const combinedSuccess = qcResult.success && policyResult.success;
      const combinedErrors = [...qcResult.errors, ...policyResult.errors];

      if (combinedSuccess) {
        validQuestions.set(ko.id, candidate);
      } else {
        if (!isMock) {
          failedQuestionsForRepair.push({
            koId: ko.id,
            courseTitle: course.title,
            chapterTitle: chapter.title,
            koTitle: ko.title,
            koConceptName: ko.conceptName,
            koType: ko.type,
            candidate,
            errors: combinedErrors,
          });
        } else {
          // In mock mode, don't run repair, fail immediately
          resultsMap.set(ko.id, {
            koId: ko.id,
            success: false,
            insertedCount: 0,
            errors: combinedErrors,
          });
        }
      }
    }

    // 7. Validation Repair Loop
    if (failedQuestionsForRepair.length > 0 && !isMock) {
      console.warn(`[QC Gate Failed] Repairing ${failedQuestionsForRepair.length} candidates with Gemini.`);
      const repairPrompt = buildQuestionRepairPromptBatch(failedQuestionsForRepair);

      try {
        const { response } = await generateContentWithFallback({
          useCase: USE_CASES.QUESTION_REVIEW,
          contents: repairPrompt,
          config: {
            responseMimeType: "application/json",
          },
        });
        const rawText = response.text || "";
        const cleanJSON = repairJsonString(rawText);
        const repairedBatch = JSON.parse(cleanJSON);
        const repairedQuestions = repairedBatch?.questions || [];

        for (const reqInfo of failedQuestionsForRepair) {
          const ko = groupKOs.find(k => k.id === reqInfo.koId)!;
          const blueprint = blueprintsMap.get(reqInfo.koId)!;
          const repairedCandidate = repairedQuestions.find((r: any) => r && r.koId === reqInfo.koId);
          if (!repairedCandidate) {
            resultsMap.set(reqInfo.koId, {
              koId: reqInfo.koId,
              success: false,
              insertedCount: 0,
              errors: ["Repair loop: repaired question not found in response", ...reqInfo.errors],
            });
            continue;
          }

          const validationInput = {
            knowledgeObjectId: reqInfo.koId,
            prompt: repairedCandidate.prompt,
            options: repairedCandidate.options,
            correctIndices: repairedCandidate.correctIndices,
            explanation: repairedCandidate.explanation,
          };

          const policy = policiesMap.get(ko.courseId);
          const qcResult = await validateQuestion(validationInput);
          
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
            updatedAt: new Date()
          };

          const policyResult = validateQuestionAgainstPolicy({
            prompt: repairedCandidate.prompt,
            options: repairedCandidate.options,
            explanation: repairedCandidate.explanation,
            bloomLevel: repairedCandidate.bloomLevel || ko.bloomLevel || "apply",
            pattern: repairedCandidate.pattern || blueprint.blueprintType,
            estimatedSteps: repairedCandidate.estimatedSteps || 2,
          }, policy || defaultPolicy);

          const combinedSuccess = qcResult.success && policyResult.success;
          const combinedErrors = [...qcResult.errors, ...policyResult.errors];

          if (combinedSuccess) {
            validQuestions.set(reqInfo.koId, repairedCandidate);
          } else {
            resultsMap.set(reqInfo.koId, {
              koId: reqInfo.koId,
              success: false,
              insertedCount: 0,
              errors: [`QC/Policy Gate blocked insertion after repair: ${combinedErrors.join("; ")}`, ...reqInfo.errors],
            });
          }
        }
      } catch (err: any) {
        for (const reqInfo of failedQuestionsForRepair) {
          resultsMap.set(reqInfo.koId, {
            koId: reqInfo.koId,
            success: false,
            insertedCount: 0,
            errors: [`Repair loop failure: ${err.message}`, ...reqInfo.errors],
          });
        }
      }
    }

    // 8. Transactional DB Write execution for valid questions
    for (const [koId, candidate] of validQuestions.entries()) {
      const ko = groupKOs.find(k => k.id === koId)!;
      const blueprint = blueprintsMap.get(koId)!;
      const generationHash = hashesMap.get(koId)!;
      const sourceMtdVersion = mtdVersionsMap.get(koId)!;

      const provenanceBlock = `

---
PROVENANCE:
  modelUsed: ${modelUsedName}
  generatedAt: ${new Date().toISOString()}
  blueprintType: ${blueprint.blueprintType}
  parentKoId: ${koId}
  parentKoHash: ${generationHash}
  validationStatus: verified`;

      const finalExplanation = `${candidate.explanation}${provenanceBlock}`;

      // E1: deterministic distractor -> misconception tagging (no AI call).
      const distractorMap = buildDistractorMap({
        options: candidate.options,
        correctIndices: candidate.correctIndices,
        blueprint,
        misconceptionKOs: misconceptionByConcept.get(ko.conceptName.trim()) ?? [],
      });

      try {
        const existing = existingQuestionsMap.get(koId) || [];
        const lockedQuestions = existing.filter(
          q => q.reviewStatus === "reviewed" || q.reviewStatus === "published"
        );
        const generatedQuestions = existing.filter(
          q => q.reviewStatus === "generated"
        );

        const writeCount = await db.transaction(async tx => {
          let count = 0;
          if (lockedQuestions.length > 0) {
            const currentCount = lockedQuestions.length + generatedQuestions.length;
            if (currentCount >= 3) {
              console.log(`[Cardinality Engine] Ceil reached (3). Preserving tutor edits, bypassing regeneration.`);
              return 0;
            }

            const newQuestionId = `q-${randomUUID()}`;
            const examExs = examExemplarsMap.get(koId) || [];
            const styledAfterId = examExs[0]?.id || null;

            await tx.insert(aiQuestionBank).values({
              id: newQuestionId,
              courseId: ko.courseId,
              knowledgeObjectId: koId,
              sourceMtdId: ko.mtdId,
              sourceMtdVersion,
              generationHash,
              difficulty: blueprint.targetDifficulty,
              questionType: "multiple_choice",
              tags: blueprint.tags,
              prompt: candidate.prompt,
              options: candidate.options,
              correctIndices: candidate.correctIndices,
              distractorMap,
              explanation: finalExplanation,
              reviewStatus: "generated",
              qualityScore: 1.0,
              styledAfterAssessmentObjectId: styledAfterId,
              pattern: candidate.pattern || blueprint.blueprintType,
              reasoningType: candidate.reasoningType || "conceptual",
              applicationLevel: candidate.bloomLevel
                ? (candidate.bloomLevel === "remember" ? 1 : candidate.bloomLevel === "understand" ? 2 : candidate.bloomLevel === "apply" ? 3 : 2)
                : (ko.bloomLevel === "remember" ? 1 : ko.bloomLevel === "understand" ? 2 : ko.bloomLevel === "apply" ? 3 : 2),
              estimatedSteps: candidate.estimatedSteps || 2,
            });
            
            const embeddingText = `Question: ${candidate.prompt}\nExplanation: ${candidate.explanation}`;
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
                  bloomLevel: candidate.bloomLevel || ko.bloomLevel || "apply",
                  difficulty: blueprint.targetDifficulty,
                  tags: blueprint.tags,
                }
              },
              status: "pending",
              attempts: 0,
            });
            
            count = 1;
          } else {
            // Clear existing generated candidates first
            for (const oldQ of generatedQuestions) {
              await tx.delete(aiQuestionBank).where(eq(aiQuestionBank.id, oldQ.id));
            }

            const newQuestionId = `q-${randomUUID()}`;
            const examExs = examExemplarsMap.get(koId) || [];
            const styledAfterId = examExs[0]?.id || null;

            await tx.insert(aiQuestionBank).values({
              id: newQuestionId,
              courseId: ko.courseId,
              knowledgeObjectId: koId,
              sourceMtdId: ko.mtdId,
              sourceMtdVersion,
              generationHash,
              difficulty: blueprint.targetDifficulty,
              questionType: "multiple_choice",
              tags: blueprint.tags,
              prompt: candidate.prompt,
              options: candidate.options,
              correctIndices: candidate.correctIndices,
              distractorMap,
              explanation: finalExplanation,
              reviewStatus: "generated",
              qualityScore: 1.0,
              styledAfterAssessmentObjectId: styledAfterId,
              pattern: candidate.pattern || blueprint.blueprintType,
              reasoningType: candidate.reasoningType || "conceptual",
              applicationLevel: candidate.bloomLevel
                ? (candidate.bloomLevel === "remember" ? 1 : candidate.bloomLevel === "understand" ? 2 : candidate.bloomLevel === "apply" ? 3 : 2)
                : (ko.bloomLevel === "remember" ? 1 : ko.bloomLevel === "understand" ? 2 : ko.bloomLevel === "apply" ? 3 : 2),
              estimatedSteps: candidate.estimatedSteps || 2,
            });
            
            const embeddingText = `Question: ${candidate.prompt}\nExplanation: ${candidate.explanation}`;
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
                  bloomLevel: candidate.bloomLevel || ko.bloomLevel || "apply",
                  difficulty: blueprint.targetDifficulty,
                  tags: blueprint.tags,
                }
              },
              status: "pending",
              attempts: 0,
            });
            
            count = 1;
          }
          return count;
        });

        resultsMap.set(koId, {
          koId,
          success: true,
          insertedCount: writeCount,
          errors: [],
        });
      } catch (err: any) {
        resultsMap.set(koId, {
          koId,
          success: false,
          insertedCount: 0,
          errors: [`Database transaction failed: ${err.message}`],
        });
      }
    }
  }

  const results = koIds.map(id => resultsMap.get(id)!);
  const success = results.every(r => r.success);
  return { success, results };
}

/**
 * Main ingestion generator service.
 * Backward-compatible wrapper that delegates to generateQuestionsForKOBatch.
 */
export async function generateQuestionsForKO(
  koId: string,
  isMockOverride?: boolean
): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
  const batchResult = await generateQuestionsForKOBatch([koId], isMockOverride);
  const result = batchResult.results.find(r => r.koId === koId);
  if (!result) {
    return { success: false, insertedCount: 0, errors: ["KO was not processed"] };
  }
  return {
    success: result.success,
    insertedCount: result.insertedCount,
    errors: result.errors,
  };
}
