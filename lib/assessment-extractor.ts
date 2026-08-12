import { db } from "@/db";
import {
  assessmentSources,
  assessmentSourceChapters,
  chapterAliases,
  assessmentObjects,
  assessmentProfiles,
  coursePolicies,
  concepts,
  conceptLocalizations,
  knowledgeObjects,
  assessmentObjectConcepts,
  assessmentObjectKos,
  chapters,
  vectorSyncQueue
} from "@/db/schema";
import { VECTOR_NAMESPACES } from "@/lib/namespaces";
import { generateContentWithFallback, withGeminiRetry, embedText } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { repairJsonString, slugify } from "./ko-utils";
import { normalizeConceptName, cosineSimilarity } from "./ko-extractor";
import { generateCanonicalHash } from "./assessment-utils";
import { ExtractionResult, ExtractedAssessmentObject } from "./questions/contracts";
import { parseFrontmatter } from "./assessment-frontmatter";

export { parseFrontmatter } from "./assessment-frontmatter";

const AssessmentObjectExtractionSchema = z.object({
  questionType: z.string().min(1),
  difficulty: z.union([z.number(), z.string()]),
  applicationLevel: z.number().int().min(0).max(5),
  concepts: z.array(z.string()),
  pattern: z.string().optional(),
  reasoningType: z.string().optional(),
  estimatedSteps: z.number().int().min(1).max(10).optional(),
  answerMarkdown: z.string().optional().nullable(),
  options: z.array(z.string()).optional().nullable(),
});

/**
 * Adapter to align extracted difficulty to the blueprint scale while preserving raw label.
 */
export function adaptExtractedDifficulty(raw: unknown): {
  normalized: "easy" | "medium" | "hard";
  numeric: number;
  raw: string;
} {
  const str = String(raw ?? "").toLowerCase().trim();
  if (str === "1" || str === "easy" || str === "mudah") {
    return { normalized: "easy", numeric: 1, raw: str };
  }
  if (str === "3" || str === "hard" || str === "sulit" || str === "tinggi" || str === "advanced") {
    return { normalized: "hard", numeric: 3, raw: str };
  }
  return { normalized: "medium", numeric: 2, raw: str || "medium" };
}

/**
 * Adapter for pattern extraction, mapping unknown patterns to "other".
 */
export function adaptExtractedPattern(raw: unknown): "direct_computation" | "graph_interpretation" | "proof" | "parameter_analysis" | "modeling" | "other" {
  const str = String(raw ?? "").toLowerCase().trim();
  if (["direct_computation", "graph_interpretation", "proof", "parameter_analysis", "modeling"].includes(str)) {
    return str as any;
  }
  return "other";
}

/**
 * Deterministically parses assessment markdown into discrete question blocks.
 */
export function parseAssessmentMarkdownIntoBlocks(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let currentLines: string[] = [];

  const headingPattern = /^##\s+(?:soal|question|pertanyaan|\d+)/i;

  for (const line of lines) {
    if (headingPattern.test(line.trim())) {
      if (currentLines.length > 0) {
        const blockText = currentLines.join("\n").trim();
        if (blockText.length > 0) {
          blocks.push(blockText);
        }
        currentLines = [];
      }
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const blockText = currentLines.join("\n").trim();
    if (blockText.length > 0) {
      blocks.push(blockText);
    }
  }

  if (blocks.length === 0 && normalized.length > 0) {
    return normalized.split(/\n\n+/).filter((block) => block.trim().length > 0);
  }

  return blocks;
}

async function resolveConceptId(conceptName: string): Promise<string> {
  const normName = normalizeConceptName(conceptName);

  const registeredLocalizations = await db
    .select({
      conceptId: conceptLocalizations.conceptId,
      displayName: conceptLocalizations.displayName,
      aliases: conceptLocalizations.aliases,
      embedding: conceptLocalizations.embedding,
    })
    .from(conceptLocalizations);

  const matchedLoc = registeredLocalizations.find((loc) => {
    if (normalizeConceptName(loc.displayName) === normName) return true;
    const aliases = Array.isArray(loc.aliases) ? loc.aliases : [];
    return aliases.some((alias) => normalizeConceptName(alias) === normName);
  });

  if (matchedLoc) {
    return matchedLoc.conceptId;
  }

  let embedding: number[] | null = null;
  if (process.env.MOCK_GEMINI !== "true") {
    try {
      embedding = await withGeminiRetry(() => embedText(conceptName));
    } catch (err) {
      console.warn(`Failed to embed candidate concept "${conceptName}":`, err);
    }
  }

  if (embedding) {
    let bestMatch: typeof registeredLocalizations[0] | null = null;
    let highestScore = 0;

    for (const loc of registeredLocalizations) {
      if (Array.isArray(loc.embedding) && loc.embedding.length > 0) {
        const score = cosineSimilarity(embedding, loc.embedding);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = loc;
        }
      }
    }

    if (bestMatch && highestScore > 0.90) {
      return bestMatch.conceptId;
    }
  }

  const newConceptId = randomUUID();
  const slug = slugify(conceptName);

  await db.insert(concepts).values({
    id: newConceptId,
    canonicalSlug: slug || `concept-${newConceptId.slice(0, 8)}`,
    isVerified: false,
  });

  let newEmbedding: number[] | null = null;
  if (process.env.MOCK_GEMINI !== "true" && !embedding) {
    try {
      newEmbedding = await withGeminiRetry(() => embedText(conceptName));
    } catch {}
  } else {
    newEmbedding = embedding;
  }

  await db.insert(conceptLocalizations).values({
    id: `cl-${randomUUID()}`,
    conceptId: newConceptId,
    lang: "id",
    displayName: conceptName,
    aliases: [],
    technicalStandardTerm: "id",
    embedding: newEmbedding,
  });

  return newConceptId;
}

async function resolveChapterId(courseId: string, chapterName: string): Promise<string | null> {
  const cleanName = chapterName.trim();
  if (!cleanName) return null;

  const [exactChapter] = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.courseId, courseId), eq(chapters.title, cleanName)));

  if (exactChapter) {
    return exactChapter.id;
  }

  const [aliasMatch] = await db
    .select({ chapterId: chapterAliases.chapterId })
    .from(chapterAliases)
    .innerJoin(chapters, eq(chapterAliases.chapterId, chapters.id))
    .where(and(eq(chapters.courseId, courseId), eq(chapterAliases.aliasName, cleanName)));

  if (aliasMatch) {
    return aliasMatch.chapterId;
  }

  return null;
}

/**
 * Extracts Assessment Objects from an Assessment Source document.
 * Returns a typed ExtractionResult.
 */
export async function extractAssessmentObjectsForSource(
  sourceId: string,
  isMockOverride?: boolean
): Promise<ExtractionResult> {
  const isMock = isMockOverride ?? (process.env.MOCK_GEMINI === "true");

  const [source] = await db
    .select()
    .from(assessmentSources)
    .where(eq(assessmentSources.id, sourceId));

  if (!source) {
    return {
      status: "failed",
      objects: [],
      errors: [`Assessment source with ID "${sourceId}" not found.`],
    };
  }

  console.log(`[Assessment Ingest] Starting ingestion for source: ${source.title}`);

  await db
    .update(assessmentSources)
    .set({
      ingestionStatus: "processing",
      ingestionStartedAt: new Date(),
      ingestionError: null,
    })
    .where(eq(assessmentSources.id, sourceId));

  const extractedObjects: ExtractedAssessmentObject[] = [];
  const extractionErrors: string[] = [];
  const diagnostics: string[] = [];

  try {
    const { frontmatter, content } = parseFrontmatter(source.sourceMarkdown);
    const blocks = parseAssessmentMarkdownIntoBlocks(content);
    console.log(`[Assessment Ingest] Split assessment into ${blocks.length} blocks.`);

    await db.delete(assessmentSourceChapters).where(eq(assessmentSourceChapters.assessmentSourceId, sourceId));

    const chapterList = frontmatter.chapters || [];
    for (const chapName of chapterList) {
      const resolvedId = await resolveChapterId(source.courseId, chapName);
      if (resolvedId) {
        await db.insert(assessmentSourceChapters).values({
          id: `asc-${randomUUID()}`,
          assessmentSourceId: sourceId,
          chapterId: resolvedId,
        });
      } else {
        diagnostics.push(`Chapter not found in registry: "${chapName}"`);
      }
    }

    await db
      .update(assessmentSources)
      .set({
        category: frontmatter.category ?? source.category,
        year: frontmatter.year ?? source.year,
        semester: frontmatter.semester ?? source.semester,
      })
      .where(eq(assessmentSources.id, sourceId));

    const oldObjects = await db
      .select({ id: assessmentObjects.id })
      .from(assessmentObjects)
      .where(eq(assessmentObjects.sourceId, sourceId));

    const oldObjectIds = oldObjects.map((o) => o.id);

    if (oldObjectIds.length > 0) {
      for (const oId of oldObjectIds) {
        await db.delete(assessmentObjectConcepts).where(eq(assessmentObjectConcepts.assessmentObjectId, oId));
        await db.delete(assessmentObjectKos).where(eq(assessmentObjectKos.assessmentObjectId, oId));
      }
      await db.delete(assessmentObjects).where(eq(assessmentObjects.sourceId, sourceId));
    }

    let order = 1;
    for (const block of blocks) {
      const headingMatch = block.match(/^##\s+([a-zA-Z\d\s.-]+)/i);
      const sourceQuestionNumber = headingMatch ? headingMatch[1].trim() : String(order);

      let rawExtracted: any = null;
      let parseFailed = false;

      if (isMock) {
        rawExtracted = {
          questionType: "multiple_choice",
          difficulty: block.includes("difficult") || block.includes("hard") ? 3 : 2,
          applicationLevel: block.includes("advanced") ? 2 : 1,
          concepts: ["limits", "functions"],
          pattern: block.includes("graph") ? "graph_interpretation" : "direct_computation",
          reasoningType: "procedural",
          estimatedSteps: 2,
          answerMarkdown: "Mock explanation: Limit of f(x) as x approaches a is L.",
          options: ["Option A", "Option B", "Option C", "Option D"],
        };
      } else {
        const prompt = `Analyze the following engineering/math test question block and classify its attributes, solution explanation, and multiple-choice options according to the schema provided.

QUESTION BLOCK:
"""
${block}
"""

You must return a single JSON object matching this schema:
{
  "questionType": "multiple_choice | essay | multiple_choices | boolean",
  "difficulty": [Integer: 1 (easy), 2 (medium), or 3 (hard) or string label],
  "applicationLevel": [Integer from 0 to 5 representing Bloom/Application level],
  "concepts": ["concept name 1", "concept name 2"],
  "pattern": "direct_computation | graph_interpretation | proof | parameter_analysis | modeling",
  "reasoningType": "procedural | conceptual | analytical",
  "estimatedSteps": [Integer representing estimated number of calculation steps],
  "answerMarkdown": "[Optional: Detailed markdown answer/solution explanation]",
  "options": [Optional: Array of options (strings)]
}

Ensure all fields are fully populated and valid JSON is returned. Do not wrap in markdown code blocks.`;

        try {
          const { response } = await generateContentWithFallback({
            useCase: USE_CASES.KO_EXTRACTION,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
            },
          });

          const rawText = response.text || "";
          const cleanJson = repairJsonString(rawText);
          const parsed = JSON.parse(cleanJson);
          rawExtracted = AssessmentObjectExtractionSchema.parse(parsed);
        } catch (err: any) {
          parseFailed = true;
          extractionErrors.push(`Failed to parse extraction output for block "${sourceQuestionNumber}": ${err.message}`);
        }
      }

      // Explicit parse/provider failure gate: Do NOT insert a generic valid-looking object silently!
      if (parseFailed || !rawExtracted) {
        diagnostics.push(`Block "${sourceQuestionNumber}" extraction failed to parse.`);
        continue;
      }

      // Explicit difficulty adapter
      const diffAdapter = adaptExtractedDifficulty(rawExtracted.difficulty);
      const patternAdapter = adaptExtractedPattern(rawExtracted.pattern);

      // Check evidence for concepts
      const conceptList = Array.isArray(rawExtracted.concepts) ? rawExtracted.concepts.filter(Boolean) : [];
      if (conceptList.length === 0) {
        diagnostics.push(`Block "${sourceQuestionNumber}" had no concept evidence extracted.`);
      }

      const extractedItem: ExtractedAssessmentObject = {
        sourceQuestionNumber,
        questionType: rawExtracted.questionType || "multiple_choice",
        difficulty: diffAdapter.normalized,
        rawDifficulty: rawExtracted.difficulty,
        applicationLevel: rawExtracted.applicationLevel ?? 1,
        concepts: conceptList,
        pattern: patternAdapter,
        reasoningType: (rawExtracted.reasoningType as any) || "procedural",
        estimatedSteps: rawExtracted.estimatedSteps || 2,
        questionMarkdown: block,
        answerMarkdown: rawExtracted.answerMarkdown || null,
        options: rawExtracted.options || null,
      };

      const assessmentObjectId = `ao-${randomUUID()}`;
      const canonicalHash = generateCanonicalHash(block);

      await db.insert(assessmentObjects).values({
        id: assessmentObjectId,
        sourceId: sourceId,
        questionOrder: order++,
        sourceQuestionNumber,
        questionType: extractedItem.questionType,
        difficulty: diffAdapter.numeric,
        applicationLevel: extractedItem.applicationLevel,
        pattern: extractedItem.pattern,
        reasoningType: extractedItem.reasoningType,
        estimatedSteps: extractedItem.estimatedSteps,
        questionMarkdown: block,
        answerMarkdown: extractedItem.answerMarkdown,
        options: extractedItem.options,
        canonicalQuestionHash: canonicalHash,
      });

      extractedItem.id = assessmentObjectId;
      extractedObjects.push(extractedItem);

      let resolvedChapterId: string | null = null;
      for (const conceptName of conceptList) {
        try {
          const conceptId = await resolveConceptId(conceptName);

          await db.insert(assessmentObjectConcepts).values({
            id: `aoc-${randomUUID()}`,
            assessmentObjectId,
            conceptId,
          });

          const activeKOs = await db
            .select({ id: knowledgeObjects.id, chapterId: knowledgeObjects.chapterId })
            .from(knowledgeObjects)
            .where(
              and(
                eq(knowledgeObjects.conceptId, conceptId),
                eq(knowledgeObjects.status, "active")
              )
            );

          for (const ko of activeKOs) {
            await db.insert(assessmentObjectKos).values({
              id: `aok-${randomUUID()}`,
              assessmentObjectId,
              koId: ko.id,
            });
            if (!resolvedChapterId) {
              resolvedChapterId = ko.chapterId;
            }
          }
        } catch (err) {
          console.error(`[Assessment Ingest] Failed to resolve concept "${conceptName}":`, err);
        }
      }

      if (!resolvedChapterId) {
        const sourceChaps = await db
          .select({ chapterId: assessmentSourceChapters.chapterId })
          .from(assessmentSourceChapters)
          .where(eq(assessmentSourceChapters.assessmentSourceId, sourceId))
          .limit(1);
        if (sourceChaps.length > 0) {
          resolvedChapterId = sourceChaps[0].chapterId;
        }
      }

      await db.insert(vectorSyncQueue).values({
        id: `sync-${randomUUID()}`,
        courseId: source.courseId,
        koId: null,
        action: "upsert",
        namespace: VECTOR_NAMESPACES.past_exams,
        payload: {
          id: assessmentObjectId,
          text: `Question: ${block}\nSolution: ${extractedItem.answerMarkdown || ""}`,
          metadata: {
            chapterId: resolvedChapterId || "",
            type: "past_exam",
            bloomLevel: extractedItem.applicationLevel === 1 ? "remember" : extractedItem.applicationLevel === 2 ? "understand" : "apply",
            difficulty: extractedItem.difficulty,
            tags: conceptList,
          }
        },
        status: "pending",
        attempts: 0,
      });
    }

    const finalStatus =
      extractionErrors.length > 0 && extractedObjects.length === 0
        ? "failed"
        : extractionErrors.length > 0 || diagnostics.length > 0
        ? "needs_review"
        : "accepted";

    await db
      .update(assessmentSources)
      .set({
        ingestionStatus: finalStatus === "failed" ? "failed" : "completed",
        ingestionCompletedAt: new Date(),
        ingestionError: extractionErrors.length > 0 ? extractionErrors.join("; ") : null,
      })
      .where(eq(assessmentSources.id, sourceId));

    await updateAssessmentProfile(source.courseId);

    return {
      status: finalStatus,
      objects: extractedObjects,
      errors: extractionErrors,
      diagnostics,
    };
  } catch (error: any) {
    console.error(`[Assessment Ingest] Critical failure during ingestion of source ${sourceId}:`, error);
    await db
      .update(assessmentSources)
      .set({
        ingestionStatus: "failed",
        ingestionError: error.message || String(error),
        ingestionCompletedAt: new Date(),
      })
      .where(eq(assessmentSources.id, sourceId));

    return {
      status: "failed",
      objects: [],
      errors: [error.message || String(error)],
    };
  }
}

export async function updateAssessmentProfile(courseId: string): Promise<void> {
  console.log(`[Assessment Profile] Recalculating profile for course ${courseId}...`);

  const objects = await db
    .select({
      id: assessmentObjects.id,
      difficulty: assessmentObjects.difficulty,
      applicationLevel: assessmentObjects.applicationLevel,
      pattern: assessmentObjects.pattern,
      questionType: assessmentObjects.questionType,
    })
    .from(assessmentObjects)
    .innerJoin(assessmentSources, eq(assessmentObjects.sourceId, assessmentSources.id))
    .where(and(eq(assessmentSources.courseId, courseId), eq(assessmentSources.ingestionStatus, "completed")));

  if (objects.length === 0) {
    return;
  }

  const totalLevel = objects.reduce((sum, obj) => sum + obj.applicationLevel, 0);
  const avgApplicationLevel = Math.round(totalLevel / objects.length);

  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  for (const obj of objects) {
    if (obj.difficulty === 1) easyCount++;
    else if (obj.difficulty === 2) mediumCount++;
    else if (obj.difficulty === 3) hardCount++;
  }
  const totalCount = objects.length;
  const difficultyDistribution = {
    easy: Math.round((easyCount / totalCount) * 100),
    medium: Math.round((mediumCount / totalCount) * 100),
    hard: Math.round((hardCount / totalCount) * 100),
  };

  const patternCounts: Record<string, number> = {};
  for (const obj of objects) {
    patternCounts[obj.pattern] = (patternCounts[obj.pattern] || 0) + 1;
  }
  const commonPatterns = Object.keys(patternCounts).sort((a, b) => patternCounts[b] - patternCounts[a]);

  const conceptRows = await db
    .select({
      displayName: conceptLocalizations.displayName,
    })
    .from(assessmentObjectConcepts)
    .innerJoin(conceptLocalizations, eq(assessmentObjectConcepts.conceptId, conceptLocalizations.conceptId))
    .innerJoin(assessmentObjects, eq(assessmentObjectConcepts.assessmentObjectId, assessmentObjects.id))
    .innerJoin(assessmentSources, eq(assessmentObjects.sourceId, assessmentSources.id))
    .where(eq(assessmentSources.courseId, courseId));

  const conceptCounts: Record<string, number> = {};
  let totalConceptReferences = 0;
  for (const row of conceptRows) {
    conceptCounts[row.displayName] = (conceptCounts[row.displayName] || 0) + 1;
    totalConceptReferences++;
  }

  const topContexts = Object.entries(conceptCounts)
    .map(([conceptName, count]) => ({
      conceptName,
      percentage: Math.round((count / totalConceptReferences) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const [existingProfile] = await db
    .select()
    .from(assessmentProfiles)
    .where(eq(assessmentProfiles.courseId, courseId));

  if (existingProfile) {
    await db
      .update(assessmentProfiles)
      .set({
        applicationLevel: avgApplicationLevel,
        difficultyDistribution,
        commonPatterns,
        topContexts,
        updatedAt: new Date(),
      })
      .where(eq(assessmentProfiles.id, existingProfile.id));
  } else {
    await db.insert(assessmentProfiles).values({
      id: `ap-${randomUUID()}`,
      courseId,
      applicationLevel: avgApplicationLevel,
      difficultyDistribution,
      commonPatterns,
      topContexts,
    });
  }

  const [existingPolicy] = await db
    .select()
    .from(coursePolicies)
    .where(eq(coursePolicies.courseId, courseId));

  if (!existingPolicy) {
    await db.insert(coursePolicies).values({
      id: `cp-${randomUUID()}`,
      courseId,
      maxApplicationLevel: 2,
      maxEstimatedSteps: 4,
      maxReadingComplexity: 2,
      allowEngineeringTerms: true,
      forbiddenContexts: [],
      allowedPatterns: ["direct_computation", "graph_interpretation", "parameter_analysis"],
    });
  }
}
