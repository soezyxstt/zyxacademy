import { db } from "@/db";
import { knowledgeObjects, vectorSyncQueue, concepts, conceptLocalizations, aiExtractionFailures, courses, chapters, masterTeachingDocuments, knowledgeObjectSources } from "@/db/schema";
import { generateContentWithFallback, embedText, withGeminiRetry } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { randomUUID } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { preprocessMarkdown, safeParseJson, slugify } from "./ko-utils";
import { env } from "@/lib/env";
import { generateStableKoKey, computeSemanticKoHash, reconcileKoExtractionRun } from "@/lib/knowledge/identity";

// ─── UTILITIES FOR CONCEPT RESOLUTION & MATCHING ──────────────────────────────

export { slugify } from "./ko-utils";

/**
 * Standardizes a concept name by lowercasing, stripping punctuation, and compressing spacing.
 */
export function normalizeConceptName(text: string): string {
 return text
 .toLowerCase()
 .replace(/[^\w\s]/g, "")
 .replace(/\s+/g, " ")
 .trim();
}

/**
 * Computes the cosine similarity score between two float vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
 let dot = 0;
 let normA = 0;
 let normB = 0;
 for (let i = 0; i < a.length; i++) {
 dot += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }
 return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

// ─── ZOD SCHEMA CONTRACTS ───────────────────────────────────────────────────

export const KnowledgeObjectSchema = z.object({
 conceptName: z.string().min(2), // Simple human-friendly name of the abstract concept (e.g. "Displacement")
 title: z.string().min(2),
 content: z.string().min(10),
 type: z.enum([
 "definition",
 "formula",
 "example",
 "misconception",
 "exercise",
 "summary",
 "objective",
 "concept_overview",
 ]),
 difficulty: z.enum(["easy", "medium", "hard"]),
 bloomLevel: z.enum([
 "remember",
 "understand",
 "apply",
 "analyze",
 "evaluate",
 "create",
 ]),
 tags: z.array(z.string()).min(1),
 importance: z.enum(["high", "medium", "low"]).default("medium"),
 metadata: z.record(z.string(), z.any()).optional().default({}),
});

export const KnowledgeObjectsListSchema = z.object({
 knowledge_objects: z.array(KnowledgeObjectSchema),
});

export type ValidatedKO = z.infer<typeof KnowledgeObjectSchema>;

// Candidate schema for extraction (separates concept name from context fields)
export const CandidateKnowledgeObjectSchema = z.object({
 conceptName: z.string().min(2),
 parentConceptName: z.string().nullable().optional(),
 title: z.string().min(2),
 content: z.string().min(10),
 type: z.enum([
 "definition",
 "formula",
 "example",
 "misconception",
 "exercise",
 "summary",
 "objective",
 "concept_overview",
 ]),
 difficulty: z.enum(["easy", "medium", "hard"]),
 bloomLevel: z.enum([
 "remember",
 "understand",
 "apply",
 "analyze",
 "evaluate",
 "create",
 ]),
 tags: z.array(z.string()).min(1),
 importance: z.enum(["high", "medium", "low"]).default("medium"),
 applicationContext: z.string().nullable().optional(),
 exampleContext: z.string().nullable().optional(),
 conceptTests: z.object({
 taughtIndependently: z.boolean(),
 chapterHeading: z.boolean(),
 existsWithoutExamples: z.boolean(),
 isUsageScenario: z.boolean(),
 }),
 metadata: z.record(z.string(), z.any()).optional().default({}),
});

export const CandidateKnowledgeObjectsListSchema = z.object({
 candidate_knowledge_objects: z.array(CandidateKnowledgeObjectSchema),
});

// Database level schema validation before insertion
export const DbKnowledgeObjectSchema = z.object({
 id: z.string().uuid(),
 courseId: z.string(),
 mtdId: z.string(),
 chapterId: z.string(),
 conceptId: z.string().uuid(),
 learningOrder: z.number().int().positive(),
 title: z.string().min(2),
 conceptName: z.string().min(2),
 content: z.string().min(10),
 type: z.enum([
 "definition",
 "formula",
 "example",
 "misconception",
 "exercise",
 "summary",
 "objective",
 "concept_overview",
 ]),
 difficulty: z.enum(["easy", "medium", "hard"]),
 bloomLevel: z.enum([
 "remember",
 "understand",
 "apply",
 "analyze",
 "evaluate",
 "create",
 ]),
 tags: z.array(z.string()).min(1),
 importance: z.enum(["high", "medium", "low"]),
 metadata: z.record(z.string(), z.any()),
 pineconeVectorId: z.string().nullable().optional(),
 status: z.enum(["active", "retired"]),
});

// ─── GEMINI STRUCTURED RESPONSE SCHEMAS ──────────────────────────────────────

const candidateKoSchema = {
 type: "OBJECT",
 properties: {
 candidate_knowledge_objects: {
 type: "ARRAY",
 items: {
 type: "OBJECT",
 properties: {
 conceptName: { type: "STRING" },
 parentConceptName: { type: "STRING" },
 title: { type: "STRING" },
 content: { type: "STRING" },
 type: {
 type: "STRING",
 enum: [
 "definition",
 "formula",
 "example",
 "misconception",
 "exercise",
 "summary",
 "objective",
 "concept_overview",
 ],
 },
 difficulty: {
 type: "STRING",
 enum: ["easy", "medium", "hard"],
 },
 bloomLevel: {
 type: "STRING",
 enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"],
 },
 tags: {
 type: "ARRAY",
 items: { type: "STRING" },
 },
 importance: {
 type: "STRING",
 enum: ["high", "medium", "low"],
 },
 applicationContext: { type: "STRING" },
 exampleContext: { type: "STRING" },
 conceptTests: {
 type: "OBJECT",
 properties: {
 taughtIndependently: { type: "BOOLEAN" },
 chapterHeading: { type: "BOOLEAN" },
 existsWithoutExamples: { type: "BOOLEAN" },
 isUsageScenario: { type: "BOOLEAN" },
 },
 required: ["taughtIndependently", "chapterHeading", "existsWithoutExamples", "isUsageScenario"],
 },
 metadata: {
 type: "OBJECT",
 properties: {},
 },
 },
 required: [
 "conceptName",
 "parentConceptName",
 "title",
 "content",
 "type",
 "difficulty",
 "bloomLevel",
 "tags",
 "importance",
 "conceptTests",
 ],
 },
 },
 },
 required: ["candidate_knowledge_objects"],
};

const canonicalizeSchema = {
 type: "OBJECT",
 properties: {
 canonicalization: {
 type: "ARRAY",
 items: {
 type: "OBJECT",
 properties: {
 original: { type: "STRING" },
 canonical: { type: "STRING" },
 },
 required: ["original", "canonical"],
 },
 },
 },
 required: ["canonicalization"],
};

const validateSchema = {
 type: "OBJECT",
 properties: {
 validation_results: {
 type: "ARRAY",
 items: {
 type: "OBJECT",
 properties: {
 conceptName: { type: "STRING" },
 isValid: { type: "BOOLEAN" },
 issues: {
 type: "ARRAY",
 items: { type: "STRING" },
 },
 },
 required: ["conceptName", "isValid", "issues"],
 },
 },
 },
 required: ["validation_results"],
};

// ─── GEMINI PROMPT BUILDERS ───────────────────────────────────────────────────

export function buildKoExtractionPrompt(
 chapterTitle: string,
 chapterMarkdown: string,
 existingConcepts: string[]
): string {
 const existingConceptsList = existingConcepts.length > 0
 ? existingConcepts.map(c => `- ${c}`).join("\n")
 : "(Tidak ada konsep sebelumnya)";

 return `You are an expert educational content curator. 
Your task is to analyze the following chapter from a course textbook and decompose it into a set of granular, self-contained, and semantically independent "Candidate Knowledge Objects".

CHAPTER TITLE:
${chapterTitle}

CHAPTER CONTENT:
${chapterMarkdown}

EXISTING CONCEPTS IN THIS COURSE:
${existingConceptsList}

CRITICAL RULES FOR CONCEPTS & CONTEXT:
1. A concept MUST be a stable, canonical academic topic (e.g. "Bilangan Real", "Pertaksamaan Rasional", "Komposisi Fungsi", "Hukum Pertama Termodinamika").
2. Do NOT embed applications, examples, scenarios, or case studies into the concept name. Separate them:
 - If a concept is used in a specific domain/application (e.g., function composition applied to thermodynamics), set "conceptName" to "Komposisi Fungsi" and set "applicationContext" to "Termodinamika".
 - If a concept is illustrated in an example or scenario (e.g., calculating Euclidean distance for robotics), set "conceptName" to "Jarak Euclidean" and set "exampleContext" to "Robotika".
 - Under no circumstances should the conceptName contain suffixes like "pada Termodinamika", "dalam Kendali Dinamis", or "untuk Robotika".
3. DEFAULT BIAS: REUSE EXISTING CONCEPTS. Aggressively avoid creating new concepts. Look at the EXISTING CONCEPTS list above. If a concept matches or is an alias/variant of an existing concept, reuse the exact conceptName. Only create a new concept when absolutely necessary.
4. CONCEPT TO KO HIERARCHY / NO MICRO-CONCEPTS:
 - A conceptName represents a high-level Mastery Unit (e.g., 'Limit Fungsi').
 - Every KO of type 'formula', 'example', 'misconception', 'exercise', 'summary', or 'objective' is a Supporting Asset and MUST map to a parent core conceptName (e.g., 'Limit Fungsi').
 - For each candidate KO, you must specify 'parentConceptName'.
 - For core concept KOs (type 'definition' or 'concept_overview'), set 'parentConceptName' to null.
 - For supporting assets (formulas, examples, misconceptions, exercises, summaries, objectives), identify which of the core concepts in this chapter they support, and set 'parentConceptName' to the exact name of that core concept.
 - Under no circumstances should a formula, example, or misconception have a unique micro-concept name (e.g. do not set parentConceptName to 'Sifat Limit Fungsi: Konstanta' or similar. Use the parent core concept name 'Limit Fungsi' instead).
5. LANGUAGE POLICY: All content (conceptName, title, content, tags, misconceptions, summaries) MUST be generated in Bahasa Indonesia. Use standard Indonesian academic terminology (e.g. "Sistem Koordinat Kartesius" instead of "Cartesian Coordinate System"). Exceptions are only allowed for English terms that are the accepted university standard in Indonesia (e.g., "RAG", "Machine Learning").

MANDATORY CONCEPT TESTS:
Before assigning a conceptName, you must internally evaluate the topic against these 4 tests:
- Test 1 (Taught Independently): Can this topic be taught independently? (e.g. "Komposisi Fungsi" can; "Komposisi Fungsi pada Termodinamika" cannot).
- Test 2 (Chapter Heading): Would this appear as a chapter or subchapter heading in a university textbook?
- Test 3 (Exists Without Examples): If all examples/applications are removed, does this topic still exist?
- Test 4 (Usage/Scenario): Is this merely a use-case, scenario, application, or illustration? (If YES, it is NOT a conceptName. Map the base topic to conceptName, and store this scenario in applicationContext or exampleContext).

EXTRACTION GUIDELINES:
1. Decompose the text into atomic, independent units of knowledge. Do not include large blocks. Each Knowledge Object must focus on a single concept, formula, example, definition, or misconception.
2. For each Knowledge Object, assign a valid category type:
 - "definition": A core terminology definition or glossary concept.
 - "formula": A mathematical formula, law, or relationship written with variables and units.
 - "example": A concrete word problem, scenario, or calculation demonstrating a concept.
 - "misconception": A common student pitfall, error, or incorrect assumption, paired with the correct understanding.
 - "exercise": A practice question or task for students.
 - "summary": A high-level chapter review block.
 - "objective": A learning target or syllabus goal.
 - "concept_overview": A general conceptual description that does not fit into other specific categories.
3. Assign a cognitive difficulty level ('easy', 'medium', 'hard') based on the complexity of the content.
4. For "bloomLevel", assign one of these exact lowercase values from Bloom's Taxonomy:
 - "remember", "understand", "apply", "analyze", "evaluate", "create".
5. Provide keyword tags mapping the concept.
6. For "importance", assign one of these exact lowercase importance levels: "high", "medium", "low".
7. The "content" field must be written in structural Markdown in Bahasa Indonesia, with clean LaTeX equations if math is present:
 - Wrap inline math in single dollar signs, like $x$ or $F = ma$.
 - Wrap block equations in double dollar signs on their own line, like $$F = m \\cdot a$$.
8. Ensure every object is completely self-contained (no references to "as mentioned in the paragraph above" or "see figure 2").

Respond ONLY with valid JSON matching this schema:
{
 "candidate_knowledge_objects": [
 {
 "conceptName": "string (canonical academic topic name in Bahasa Indonesia, e.g. 'Komposisi Fungsi')",
 "parentConceptName": "string or null (the name of the parent core concept, or null if this is itself a core concept definition or overview)",
 "title": "string (clear human-readable title in Bahasa Indonesia)",
 "content": "string (Markdown + LaTeX in Bahasa Indonesia)",
 "type": "definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview",
 "difficulty": "easy" | "medium" | "hard",
 "bloomLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
 "tags": ["string"],
 "importance": "high" | "medium" | "low",
 "applicationContext": "string or null (e.g., 'Termodinamika' if applicable)",
 "exampleContext": "string or null (e.g., 'Robotika' if applicable)",
 "conceptTests": {
 "taughtIndependently": boolean,
 "chapterHeading": boolean,
 "existsWithoutExamples": boolean,
 "isUsageScenario": boolean
 }
 }
 ]
}`;
}

// ─── OBSERVABILITY LAYER ─────────────────────────────────────────────────────

async function saveParsingFailure(params: {
 courseId: string | null;
 chapterId: string | null;
 step: "extraction" | "canonicalization" | "validation";
 rawOutput: string;
 errorMessage: string;
}) {
 try {
 await db.insert(aiExtractionFailures).values({
 id: randomUUID(),
 courseId: params.courseId,
 chapterId: params.chapterId,
 step: params.step,
 rawOutput: params.rawOutput,
 errorMessage: params.errorMessage,
 });
 } catch (dbErr) {
 console.error("Failed to write AI extraction failure to database:", dbErr);
 }
}

// ─── FOREIGN KEY VALIDATOR ───────────────────────────────────────────────────

async function validateForeignKeys(params: {
 courseId: string;
 mtdId: string;
 chapterId: string;
}): Promise<void> {
 const [courseExists] = await db
 .select({ id: courses.id })
 .from(courses)
 .where(eq(courses.id, params.courseId))
 .limit(1);
 if (!courseExists) {
 throw new Error(`Foreign key constraint failed: courseId '${params.courseId}' does not exist in courses table.`);
 }

 const [mtdExists] = await db
 .select({ id: masterTeachingDocuments.id })
 .from(masterTeachingDocuments)
 .where(eq(masterTeachingDocuments.id, params.mtdId))
 .limit(1);
 if (!mtdExists) {
 throw new Error(`Foreign key constraint failed: mtdId '${params.mtdId}' does not exist in masterTeachingDocuments table.`);
 }

 const [chapterExists] = await db
 .select({ id: chapters.id })
 .from(chapters)
 .where(eq(chapters.id, params.chapterId))
 .limit(1);
 if (!chapterExists) {
 throw new Error(`Foreign key constraint failed: chapterId '${params.chapterId}' does not exist in chapters table.`);
 }
}

// ─── CANONICALIZATION STAGE ──────────────────────────────────────────────────

export async function canonicalizeConcepts(
 candidateNames: string[],
 existingConcepts: string[],
 context?: { courseId?: string; chapterId?: string }
): Promise<Record<string, string>> {
 if (candidateNames.length === 0) return {};

 if (process.env.MOCK_GEMINI === "true") {
 const mockMap: Record<string, string> = {};
 for (const name of candidateNames) {
 mockMap[name] = name;
 }
 return mockMap;
 }

 const prompt = `You are a concept canonicalization and alias-resolution service for an educational system.
Your job is to analyze the candidate concept names extracted from a new course chapter, compare them with existing course concepts, and map them to their stable, canonical, and reusable Indonesian names.

CANDIDATE CONCEPT NAMES TO CANONICALIZE:
${JSON.stringify(candidateNames, null, 2)}

EXISTING CONCEPTS IN THIS COURSE (USE AS PREFERRED CANONICAL TARGETS):
${JSON.stringify(existingConcepts, null, 2)}

CANONICALIZATION RULES:
1. Alias & Translation Resolution: Match synonyms, abbreviations, casing differences, and translations (e.g. English to Indonesian).
 - E.g., "Coordinate System", "Cartesian Coordinate", "Sistem Koordinat" → "Sistem Koordinat Kartesius"
 - E.g., "Function Composition", "Komposisi Fungsi" → "Komposisi Fungsi"
2. Strict Bahasa Indonesia Policy: Prefer Indonesian terms over English terms whenever possible. Use English terms ONLY if there is no accepted academic equivalent in Bahasa Indonesia (e.g., "RAG", "LLM" in computer science).
3. Concept Reusability: Map candidates to existing course concepts if they represent the same underlying topic.
4. Clean Canonical Naming: Ensure the canonical name is 1-4 words (max 5 words) and describes a stable, independent, academic topic taught in school or university. Aggressively strip any context, use-cases, applications, or examples.
 - Incorrect: "Komposisi Fungsi pada Termodinamika" → Correct: "Komposisi Fungsi"
 - Incorrect: "Jarak Euclidean untuk Robotika" → Correct: "Jarak Euclidean"
5. If the candidate name itself is already canonical and clean, map it to itself.

Respond ONLY with valid JSON matching this schema:
{
 "canonicalization": [
 {
 "original": "string (the original candidate concept name)",
 "canonical": "string (the stable, canonical Indonesian concept name)"
 }
 ]
}`;

 const CanonicalizeListSchema = z.object({
 canonicalization: z.array(
 z.object({
 original: z.string(),
 canonical: z.string(),
 })
 ),
 });

 let rawText = "";
 try {
  const { response } = await generateContentWithFallback({
    useCase: USE_CASES.KO_VALIDATION,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: canonicalizeSchema,
    },
  });
  rawText = response.text ?? "";
 const parseResult = safeParseJson(rawText, CanonicalizeListSchema);

 const mapping: Record<string, string> = {};
 if (parseResult.success) {
 for (const item of parseResult.data.canonicalization) {
 if (item.original && item.canonical) {
 mapping[item.original.trim()] = item.canonical.trim();
 }
 }
 } else {
 throw parseResult.error;
 }

 // Fill in any missing mappings to fallback to original
 for (const name of candidateNames) {
 if (!mapping[name]) {
 mapping[name] = name;
 }
 }
 return mapping;
 } catch (err: any) {
 console.error("Failed to canonicalize concepts, attempting retry:", err);
 await saveParsingFailure({
 courseId: context?.courseId ?? null,
 chapterId: context?.chapterId ?? null,
 step: "canonicalization",
 rawOutput: rawText || "(No LLM Output)",
 errorMessage: err?.message || String(err),
 });

 // Attempt Regeneration
 const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response was invalid. Error detail: ${err?.message || err}. Respond ONLY with valid JSON fitting the schema.`;
 let retryRaw = "";
 try {
  const { response: retryResponse } = await generateContentWithFallback({
    useCase: USE_CASES.KO_VALIDATION,
    contents: retryPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: canonicalizeSchema,
    },
  });
  retryRaw = retryResponse.text ?? "";
 const retryResult = safeParseJson(retryRaw, CanonicalizeListSchema);

 const mapping: Record<string, string> = {};
 if (retryResult.success) {
 for (const item of retryResult.data.canonicalization) {
 if (item.original && item.canonical) {
 mapping[item.original.trim()] = item.canonical.trim();
 }
 }
 for (const name of candidateNames) {
 if (!mapping[name]) {
 mapping[name] = name;
 }
 }
 return mapping;
 } else {
 throw retryResult.error;
 }
 } catch (retryErr: any) {
 console.error("Failed canonicalization retry, returning identity mapping:", retryErr);
 await saveParsingFailure({
 courseId: context?.courseId ?? null,
 chapterId: context?.chapterId ?? null,
 step: "canonicalization",
 rawOutput: retryRaw || "(No LLM Output)",
 errorMessage: `[Retry Failed] ${retryErr?.message || String(retryErr)}`,
 });

 const identityMap: Record<string, string> = {};
 for (const name of candidateNames) {
 identityMap[name] = name;
 }
 return identityMap;
 }
 }
}

// ─── VALIDATION STAGE ────────────────────────────────────────────────────────

export async function validateConcepts(
 canonicalNames: string[],
 existingConcepts: string[],
 context?: { courseId?: string; chapterId?: string }
): Promise<Record<string, { isValid: boolean; issues: string[] }>> {
 const results: Record<string, { isValid: boolean; issues: string[] }> = {};
 if (canonicalNames.length === 0) return results;

 // Initialize with programmatic validations first
 for (const name of canonicalNames) {
 const wordCount = name.split(/\s+/).filter(Boolean).length;
 const issues: string[] = [];
 if (wordCount > 5) {
 issues.push(`excessive length: concept name '${name}' has ${wordCount} words (maximum 5 words preferred)`);
 }
 results[name] = {
 isValid: issues.length === 0,
 issues,
 };
 }

 if (process.env.MOCK_GEMINI === "true") {
 return results;
 }

 const prompt = `You are a concept validation service for an educational system.
Your job is to audit and validate a list of canonical concept names to ensure they represent stable, independent, and reusable academic topics, and flag any suspicious or incorrect ones.

CANONICAL CONCEPT NAMES TO AUDIT:
${JSON.stringify(canonicalNames, null, 2)}

EXISTING CONCEPTS IN THE COURSE (FOR REFERENCE):
${JSON.stringify(existingConcepts, null, 2)}

VALIDATION CHECKS TO PERFORM:
1. Excessive Length: Concept names should be 1-4 words (5 words is acceptable but suspicious). Names longer than 5 words should trigger a warning.
2. Contextual or Application-Derived: Flag concept names that contain application domains, scenarios, case studies, or worked example context.
 - Examples of invalid/contextual concepts: "Komposisi Fungsi pada Termodinamika", "Jarak Euclidean untuk Robotika", "Nilai Mutlak dalam Kehidupan Sehari-hari".
 - These must be flagged as invalid because they are contextual usages, not the canonical topic.
3. Duplicate or Semantic Overlap: Flag concept names that overlap semantically with other concepts in the course (e.g., "Fungsi Komposisi" and "Komposisi Fungsi", or "Hukum Newton 2" and "Hukum Kedua Newton").
4. Inconsistent Naming Language: Flag concept names that are written in English when an Indonesian equivalent is standard (e.g., "Function Composition" instead of "Komposisi Fungsi", or "Real Numbers" instead of "Bilangan Real").

For each concept, output whether it is valid and a list of specific issues if any.

Respond ONLY with valid JSON matching this schema:
{
 "validation_results": [
 {
 "conceptName": "string (the canonical concept name audited)",
 "isValid": boolean,
 "issues": ["string (description of the validation issue, or empty if valid)"]
 }
 ]
}`;

 const ValidationListSchema = z.object({
 validation_results: z.array(
 z.object({
 conceptName: z.string(),
 isValid: z.boolean(),
 issues: z.array(z.string()),
 })
 ),
 });

 let rawText = "";
 try {
  const { response } = await generateContentWithFallback({
    useCase: USE_CASES.KO_VALIDATION,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: validateSchema,
    },
  });
  rawText = response.text ?? "";
  const parseResult = safeParseJson(rawText, ValidationListSchema);

 if (parseResult.success) {
 for (const item of parseResult.data.validation_results) {
 const name = item.conceptName;
 const current = results[name] || { isValid: true, issues: [] };
 const newIssues = [...current.issues, ...(item.issues || [])];
 results[name] = {
 isValid: item.isValid && current.isValid && newIssues.length === 0,
 issues: newIssues,
 };
 }
 return results;
 } else {
 throw parseResult.error;
 }
 } catch (err: any) {
 console.error("Failed to run semantic concept validation LLM check, attempting retry:", err);
 await saveParsingFailure({
 courseId: context?.courseId ?? null,
 chapterId: context?.chapterId ?? null,
 step: "validation",
 rawOutput: rawText || "(No LLM Output)",
 errorMessage: err?.message || String(err),
 });

 const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response was invalid. Error detail: ${err?.message || err}. Respond ONLY with valid JSON fitting the schema.`;
 let retryRaw = "";
 try {
  const { response: retryResponse } = await generateContentWithFallback({
    useCase: USE_CASES.KO_VALIDATION,
    contents: retryPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: validateSchema,
    },
  });
  retryRaw = retryResponse.text ?? "";
  const retryResult = safeParseJson(retryRaw, ValidationListSchema);

 if (retryResult.success) {
 for (const item of retryResult.data.validation_results) {
 const name = item.conceptName;
 const current = results[name] || { isValid: true, issues: [] };
 const newIssues = [...current.issues, ...(item.issues || [])];
 results[name] = {
 isValid: item.isValid && current.isValid && newIssues.length === 0,
 issues: newIssues,
 };
 }
 return results;
 } else {
 throw retryResult.error;
 }
 } catch (retryErr: any) {
 console.error("Failed validation retry, using programmatic defaults:", retryErr);
 await saveParsingFailure({
 courseId: null,
 chapterId: null,
 step: "validation",
 rawOutput: retryRaw || "(No LLM Output)",
 errorMessage: `[Retry Failed] ${retryErr?.message || String(retryErr)}`,
 });
 return results;
 }
 }
}

// ─── E2E WORKFLOW ────────────────────────────────────────────────────────────

/**
 * Calls Gemini to extract Candidate Knowledge Objects, runs canonicalization
 * and validation stages, and saves completed Knowledge Objects into the database.
 */
export async function extractKnowledgeObjectsForChapter(
 courseId: string,
 mtdId: string,
 chapterId: string,
 chapterTitle: string,
 chapterMarkdown: string
): Promise<ValidatedKO[]> {
 // 0. Validate Foreign Keys (Throws if missing key records in course/mtd/chapter tables)
 await validateForeignKeys({ courseId, mtdId, chapterId });

 // 1. Retrieve all registered concepts globally for matching
 const registeredLocalizations = await db
 .select({
 conceptId: conceptLocalizations.conceptId,
 displayName: conceptLocalizations.displayName,
 aliases: conceptLocalizations.aliases,
 embedding: conceptLocalizations.embedding,
 })
 .from(conceptLocalizations);

 const existingConcepts = Array.from(new Set(registeredLocalizations.map(l => l.displayName.trim()))).filter(Boolean);

 // 2. Preprocess PDF-derived markdown
 const cleanedMarkdown = preprocessMarkdown(chapterMarkdown);
 const preprocessedMarkdown = env.FEATURE_KO_PIPELINE_V2 === "1" ? cleanedMarkdown : cleanedMarkdown.slice(0, 30_000);

 // Cap existing concepts list sent to model ; too many concepts bloat the prompt
 const existingConceptsCapped = existingConcepts.slice(0, 300);

 // 3. Candidate Extraction Call with Retry Hierarchy
 const prompt = buildKoExtractionPrompt(chapterTitle, preprocessedMarkdown, existingConceptsCapped);
 let candidateBatch: any[] = [];
 let rawOutput = "";

 try {
  const { response } = await generateContentWithFallback({
    useCase: USE_CASES.KO_EXTRACTION,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: candidateKoSchema,
    },
  });
  rawOutput = response.text ?? "";
  const parseResult = safeParseJson(rawOutput, CandidateKnowledgeObjectsListSchema);
 if (parseResult.success) {
 candidateBatch = parseResult.data.candidate_knowledge_objects;
 } else {
 throw parseResult.error;
 }
 } catch (err: any) {
 console.warn(`Initial parsing/validation failed on extraction. Retrying with error details...`, err);
 await saveParsingFailure({
 courseId,
 chapterId,
 step: "extraction",
 rawOutput: rawOutput || "(No LLM Output)",
 errorMessage: err?.message || String(err),
 });

 const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response was invalid. Error detail: ${err?.message || err}. Respond ONLY with valid JSON fitting the schema.`;
 let retryRaw = "";
 try {
  const { response: retryResponse } = await generateContentWithFallback({
    useCase: USE_CASES.KO_EXTRACTION,
    contents: retryPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: candidateKoSchema,
    },
  });
  retryRaw = retryResponse.text ?? "";
  const retryResult = safeParseJson(retryRaw, CandidateKnowledgeObjectsListSchema);
 if (retryResult.success) {
 candidateBatch = retryResult.data.candidate_knowledge_objects;
 } else {
 throw retryResult.error;
 }
 } catch (retryErr: any) {
 console.error(`Regeneration also failed. Invoking Fallback KO creation...`, retryErr);
 await saveParsingFailure({
 courseId,
 chapterId,
 step: "extraction",
 rawOutput: retryRaw || "(No LLM Output)",
 errorMessage: `[Retry Failed] ${retryErr?.message || String(retryErr)}`,
 });

 // Construct safe Fallback KO matching Zod schema to prevent pipeline failure
 candidateBatch = [
 {
 conceptName: chapterTitle,
 title: `Konsep Utama: ${chapterTitle}`,
 content: preprocessedMarkdown.slice(0, 1000) || `Ringkasan materi untuk bab ${chapterTitle}`,
 type: "concept_overview",
 difficulty: "medium",
 bloomLevel: "understand",
 tags: ["fallback"],
 importance: "high",
 applicationContext: null,
 exampleContext: null,
 conceptTests: {
 taughtIndependently: true,
 chapterHeading: true,
 existsWithoutExamples: true,
 isUsageScenario: false,
 },
 metadata: {
 fallback: true,
 error: retryErr?.message || String(retryErr),
 },
 },
 ];
 }
 }  // Parse and sanitize candidates via Zod (safe loop for final assembly)
  const coreConceptsInBatch = new Set<string>();
  const normalizedCoreConceptsInBatch = new Set<string>();
  for (const rawItem of candidateBatch) {
    if (rawItem && (rawItem.type === "definition" || rawItem.type === "concept_overview")) {
      if (rawItem.conceptName) {
        const trimmed = rawItem.conceptName.trim();
        coreConceptsInBatch.add(trimmed);
        normalizedCoreConceptsInBatch.add(normalizeConceptName(trimmed));
      }
    }
  }

  const normalizedExistingConcepts = new Set(existingConcepts.map(c => normalizeConceptName(c)));

  let lastConceptName = chapterTitle;
  const validatedCandidates: z.infer<typeof CandidateKnowledgeObjectSchema>[] = [];
  for (const rawItem of candidateBatch) {
    try {
      // If this is a core concept, update our tracker
      if (rawItem.type === "definition" || rawItem.type === "concept_overview") {
        if (rawItem.conceptName) {
          lastConceptName = rawItem.conceptName.trim();
        }
      } else {
        // This is a supporting asset
        const parent = rawItem.parentConceptName ? rawItem.parentConceptName.trim() : null;
        if (parent) {
          const normParent = normalizeConceptName(parent);
          if (normalizedCoreConceptsInBatch.has(normParent)) {
            // Find the exact name from batch to preserve casing/canonical form
            const exactName = Array.from(coreConceptsInBatch).find(c => normalizeConceptName(c) === normParent) || parent;
            rawItem.conceptName = exactName;
            rawItem.parentConceptName = exactName;
          } else if (normalizedExistingConcepts.has(normParent)) {
            const exactName = existingConcepts.find(c => normalizeConceptName(c) === normParent) || parent;
            rawItem.conceptName = exactName;
            rawItem.parentConceptName = exactName;
          } else {
            console.warn(`[Normalization Guard] parentConceptName "${parent}" is not a known concept. Falling back to "${lastConceptName}".`);
            if (!rawItem.metadata) rawItem.metadata = {};
            if (!rawItem.metadata.normalizationWarnings) rawItem.metadata.normalizationWarnings = [];
            rawItem.metadata.normalizationWarnings.push(`Invalid parent concept "${parent}", fell back to "${lastConceptName}"`);
            rawItem.conceptName = lastConceptName;
            rawItem.parentConceptName = lastConceptName;
          }
        } else {
          rawItem.conceptName = lastConceptName;
          rawItem.parentConceptName = lastConceptName;
        }
      }

      const prepared = {
        ...rawItem,
        applicationContext: rawItem.applicationContext || null,
        exampleContext: rawItem.exampleContext || null,
        conceptTests: rawItem.conceptTests || {
          taughtIndependently: true,
          chapterHeading: true,
          existsWithoutExamples: true,
          isUsageScenario: false,
        },
      };
      validatedCandidates.push(CandidateKnowledgeObjectSchema.parse(prepared));
    } catch (zodErr) {
      console.warn("Skipping candidate item due to Zod validation failure:", zodErr, rawItem);
    }
  }

 if (validatedCandidates.length === 0) {
 return [];
 }

 // 4. Global Registry Concept Resolution
 const conceptResolutionMap: Record<string, { conceptId: string; canonicalName: string }> = {};

 for (const candidate of validatedCandidates) {
 const origName = candidate.conceptName.trim();
 if (conceptResolutionMap[origName]) continue;

 const normName = normalizeConceptName(origName);

 // Step A: Deterministic Exact Match (and Aliases)
 const matchedLoc = registeredLocalizations.find(loc => {
 if (normalizeConceptName(loc.displayName) === normName) return true;
 const aliases = Array.isArray(loc.aliases) ? loc.aliases : [];
 return aliases.some(alias => normalizeConceptName(alias) === normName);
 });

 if (matchedLoc) {
 console.log(`Deterministic exact registry match found: "${origName}" -> "${matchedLoc.displayName}"`);
 conceptResolutionMap[origName] = {
 conceptId: matchedLoc.conceptId,
 canonicalName: matchedLoc.displayName,
 };
 continue;
 }

 // Step B: In-Memory Cosine Similarity Vector Matching
 let embedding: number[] | null = null;
 if (process.env.MOCK_GEMINI !== "true") {
 try {
 embedding = await withGeminiRetry(() => embedText(origName));
 } catch (embedErr) {
 console.warn(`Failed to embed candidate concept "${origName}":`, embedErr);
 }
 }

 if (embedding) {
 let bestMatchLoc: typeof registeredLocalizations[0] | null = null;
 let highestScore = 0;

 for (const loc of registeredLocalizations) {
 if (Array.isArray(loc.embedding) && loc.embedding.length > 0) {
 const score = cosineSimilarity(embedding, loc.embedding);
 if (score > highestScore) {
 highestScore = score;
 bestMatchLoc = loc;
 }
 }
 }

 if (bestMatchLoc && highestScore > 0.90) {
 console.log(`Semantic vector registry match found: "${origName}" -> "${bestMatchLoc.displayName}" (Score: ${highestScore.toFixed(3)})`);
 conceptResolutionMap[origName] = {
 conceptId: bestMatchLoc.conceptId,
 canonicalName: bestMatchLoc.displayName,
 };
 continue;
 }

 // Step C: Fallback LLM Alignment (score range 0.75 - 0.90)
 if (bestMatchLoc && highestScore >= 0.75) {
 console.log(`Potential semantic match: "${origName}" ~ "${bestMatchLoc.displayName}" (Score: ${highestScore.toFixed(3)}). Consulting LLM...`);
 const mapping = await canonicalizeConcepts([origName], [bestMatchLoc.displayName], { courseId, chapterId });
 const canonicalName = mapping[origName] || origName;
 if (canonicalName === bestMatchLoc.displayName) {
 console.log(`LLM aligned: "${origName}" -> "${canonicalName}"`);
 conceptResolutionMap[origName] = {
 conceptId: bestMatchLoc.conceptId,
 canonicalName: canonicalName,
 };
 continue;
 }
 }
 }

 // Step D: Create new registry entry if no match
 const newConceptId = randomUUID();
 console.log(`Creating new registry concept: "${origName}"`);
 conceptResolutionMap[origName] = {
 conceptId: newConceptId,
 canonicalName: origName,
 };
 }

 // 5. Concept Validation Stage
 const uniqueCanonicalNames = Array.from(new Set(Object.values(conceptResolutionMap).map(r => r.canonicalName))).filter(Boolean);
 const validationResults = await validateConcepts(uniqueCanonicalNames, existingConcepts, { courseId, chapterId });

 // 6. Gather New Registry Concepts to insert
 const newConceptsToRegister: { id: string; canonicalSlug: string; isVerified: boolean }[] = [];
 const newLocalizationsToRegister: {
 id: string;
 conceptId: string;
 lang: "id" | "en";
 displayName: string;
 aliases: string[];
 technicalStandardTerm: "id" | "en";
 embedding: number[] | null;
 }[] = [];

 for (const candidate of validatedCandidates) {
 const origName = candidate.conceptName.trim();
 const resolution = conceptResolutionMap[origName];
 if (
 resolution &&
 !registeredLocalizations.some(loc => loc.conceptId === resolution.conceptId) &&
 !newConceptsToRegister.some(c => c.id === resolution.conceptId)
 ) {
 const slug = slugify(resolution.canonicalName);
 newConceptsToRegister.push({
 id: resolution.conceptId,
 canonicalSlug: slug,
 isVerified: false,
 });

 let embedding: number[] | null = null;
 if (process.env.MOCK_GEMINI !== "true") {
 try {
 embedding = await withGeminiRetry(() => embedText(resolution.canonicalName));
 } catch (embedErr) {
 console.warn(`Failed to embed canonical name "${resolution.canonicalName}":`, embedErr);
 }
 }

 newLocalizationsToRegister.push({
 id: randomUUID(),
 conceptId: resolution.conceptId,
 lang: "id",
 displayName: resolution.canonicalName,
 aliases: [],
 technicalStandardTerm: "id",
 embedding: embedding,
 });
 }
 }

 // 7. Database Save Pipeline (SQLite writes with Transactional Outbox)
 const koValues = validatedCandidates.map((candidate, idx) => {
 const origName = candidate.conceptName.trim();
 const resolution = conceptResolutionMap[origName] || { conceptId: randomUUID(), canonicalName: origName };
 const canonicalName = resolution.canonicalName;
 const conceptIdUUID = resolution.conceptId;
 const valResult = validationResults[canonicalName] || { isValid: true, issues: [] };

 const generatedConceptId = conceptIdUUID; // decoupled UUID concept identity

 const mergedMetadata = {
 ...(candidate.metadata || {}),
 applicationContext: candidate.applicationContext || null,
 exampleContext: candidate.exampleContext || null,
 conceptTests: candidate.conceptTests,
 validation: {
 isValid: valResult.isValid,
 issues: valResult.issues,
 },
 };

 const koRow = {
 id: randomUUID(),
 courseId,
 mtdId,
 chapterId,
 conceptId: generatedConceptId,
 learningOrder: idx + 1,
 title: candidate.title,
 conceptName: canonicalName,
 content: candidate.content,
 type: candidate.type,
 difficulty: candidate.difficulty,
 bloomLevel: candidate.bloomLevel,
 tags: candidate.tags,
 importance: candidate.importance,
 metadata: mergedMetadata,
 pineconeVectorId: null,
 status: "active" as const,
 };

 // Strict schema validation before DB insertion
 DbKnowledgeObjectSchema.parse(koRow);

 return koRow;
 });

   if (koValues.length > 0) {
    const { createHash } = await import("crypto");
    const { websiteMaterials, flashcardSets, diktats, aiQuestionBank } = await import("@/db/schema");

    // 1. Compute Source Hash from the input markdown
    const sourceHash = createHash("sha256").update(chapterMarkdown).digest("hex");

    // 2. Compute Derived Hash from extracted KO content
    const derivedHashInput = [...koValues]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(ko => `${ko.title}:${ko.content}:${ko.difficulty}:${ko.bloomLevel}`)
      .join("|");
    const derivedHash = createHash("sha256").update(derivedHashInput).digest("hex");

    // 3. Fetch existing MTD to check if derived hash changed
    const [existingMtd] = await db
      .select()
      .from(masterTeachingDocuments)
      .where(eq(masterTeachingDocuments.id, mtdId));

    const derivedHashChanged = !existingMtd || existingMtd.derivedHash !== derivedHash;
    const nextVersion = existingMtd ? (derivedHashChanged ? existingMtd.version + 1 : existingMtd.version) : 1;

    await db.transaction(async (tx) => {
      const isV2Enabled = env.FEATURE_KO_PIPELINE_V2 === '1';

      if (isV2Enabled) {
        // V2 Non-destructive KO Upsert & Provenance Reconciliation
        const existingKos = await tx
          .select({
            id: knowledgeObjects.id,
            stableKey: knowledgeObjects.stableKey,
            semanticHash: knowledgeObjects.semanticHash,
            version: knowledgeObjects.version,
            status: knowledgeObjects.status,
            chapterId: knowledgeObjects.chapterId,
          })
          .from(knowledgeObjects)
          .where(eq(knowledgeObjects.chapterId, chapterId));

        const candidateInputs = koValues.map((ko: any) => {
          const titleIdx = chapterMarkdown.indexOf(ko.title);
          const startOffset = titleIdx >= 0 ? titleIdx : 0;
          const endOffset = startOffset + Math.max(ko.title.length, 10);
          const semanticHash = computeSemanticKoHash(ko.title, ko.content, (ko.type as any) || 'definition', 'core');
          return {
            title: ko.title,
            summary: ko.content,
            knowledgeKind: (ko.type as any) || 'definition',
            instructionalRole: 'core' as const,
            sourceSpans: [
              {
                sourceDocumentId: mtdId,
                sourceVersion: `${nextVersion}.0`,
                chapterId,
                startOffset,
                endOffset,
                sourceHash,
                excerptHash: semanticHash,
                supportRole: 'core' as const,
              },
            ],
          };
        });

        const { reconciliations, hasAmbiguousMatch } = reconcileKoExtractionRun(
          existingKos as any,
          candidateInputs,
          mtdId,
          chapterId
        );

        if (hasAmbiguousMatch) {
          console.warn(`[ko-extractor] Ambiguous KO match detected for chapter ${chapterId}. Gating DB mutation for human review.`);
        } else {
          for (const rec of reconciliations) {
            if (rec.action === 'supersede' && rec.existingId) {
              await tx
                .update(knowledgeObjects)
                .set({ status: 'superseded', updatedAt: new Date() })
                .where(eq(knowledgeObjects.id, rec.existingId));
            }
          }

          // Insert new concepts if any
          if (newConceptsToRegister.length > 0) {
            await tx.insert(concepts).values(newConceptsToRegister);
            await tx.insert(conceptLocalizations).values(newLocalizationsToRegister);
          }

          // Execute reconciliations cleanly and persist source spans
          for (let i = 0; i < koValues.length; i++) {
            const ko = koValues[i];
            const rec = reconciliations[i];
            const candidateInput = candidateInputs[i];
            const stableKey = generateStableKoKey(mtdId, chapterId, ko.title);
            const semanticHash = computeSemanticKoHash(ko.title, ko.content, (ko.type as any) || 'other', 'core');
            const targetKoId = (rec && (rec.action === 'update' || rec.action === 'supersede') && rec.existingId)
              ? rec.existingId
              : ko.id;

            if (!rec || rec.action === 'insert') {
              await tx.insert(knowledgeObjects).values({
                ...ko,
                stableKey,
                semanticHash,
                knowledgeKind: (ko.type as any) || 'other',
                instructionalRole: 'core',
              });
            } else if (rec.action === 'update' && rec.existingId) {
              await tx
                .update(knowledgeObjects)
                .set({
                  conceptName: ko.conceptName,
                  title: ko.title,
                  content: ko.content,
                  type: ko.type,
                  semanticHash,
                  status: 'active',
                  updatedAt: new Date(),
                })
                .where(eq(knowledgeObjects.id, rec.existingId));
            } else if (rec.action === 'supersede' && rec.existingId) {
              await tx
                .update(knowledgeObjects)
                .set({ status: 'superseded', updatedAt: new Date() })
                .where(eq(knowledgeObjects.id, rec.existingId));

              await tx.insert(knowledgeObjects).values({
                ...ko,
                stableKey,
                semanticHash,
                knowledgeKind: (ko.type as any) || 'other',
                instructionalRole: 'core',
              });
            }

            // Persist source spans provenance into DB
            if (candidateInput && candidateInput.sourceSpans && candidateInput.sourceSpans.length > 0) {
              for (const span of candidateInput.sourceSpans) {
                await tx.insert(knowledgeObjectSources).values({
                  id: `kos-${randomUUID()}`,
                  knowledgeObjectId: targetKoId,
                  sourceDocumentId: mtdId,
                  sourceVersion: `${nextVersion}.0`,
                  chapterId,
                  startOffset: span.startOffset,
                  endOffset: span.endOffset,
                  sourceHash: span.sourceHash,
                  excerptHash: span.excerptHash,
                  supportRole: span.supportRole,
                  createdAt: new Date(),
                }).onConflictDoNothing();
              }
            }
          }
        }
      } else {
        // Legacy: Delete previous KOs for this chapter to prevent duplicates
        await tx.delete(knowledgeObjects).where(eq(knowledgeObjects.chapterId, chapterId));

        // Insert new registry concepts if any
        if (newConceptsToRegister.length > 0) {
          await tx.insert(concepts).values(newConceptsToRegister);
          await tx.insert(conceptLocalizations).values(newLocalizationsToRegister);
        }

        // Insert new KOs
        await tx.insert(knowledgeObjects).values(koValues);
      }

      // Update MTD record with new version and hashes
      await tx
        .update(masterTeachingDocuments)
        .set({
          sourceHash,
          derivedHash,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(masterTeachingDocuments.id, mtdId));

      // 4. Cascade staleness only if the derived hash (semantic meaning) has changed
      if (derivedHashChanged && existingMtd) {
        console.log(`[Staleness Cascade] Derived hash changed. Marking downstream assets stale for MTD ${mtdId}`);
        await tx
          .update(websiteMaterials)
          .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
          .where(eq(websiteMaterials.sourceMtdId, mtdId));

        await tx
          .update(flashcardSets)
          .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
          .where(eq(flashcardSets.sourceMtdId, mtdId));

        await tx
          .update(diktats)
          .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
          .where(eq(diktats.sourceMtdId, mtdId));

        await tx
          .update(aiQuestionBank)
          .set({ isStale: true, sourceMtdVersion: nextVersion })
          .where(eq(aiQuestionBank.sourceMtdId, mtdId));
      }

      // Insert vector sync outbox payloads (routed to 'learning' namespace)
      const outboxPayloads = koValues.map((ko) => {
        const embeddingText = `Title: ${ko.title}\nConcept: ${ko.conceptName}\nContent: ${ko.content}`;
        return {
          id: randomUUID(),
          courseId,
          koId: ko.id,
          action: "upsert" as const,
          namespace: "learning" as const,
          payload: {
            text: embeddingText,
            metadata: {
              chapterId: ko.chapterId,
              type: ko.type,
              bloomLevel: ko.bloomLevel,
              difficulty: ko.difficulty,
              tags: ko.tags,
            },
          },
          status: "pending" as const,
          attempts: 0,
        };
      });

      await tx.insert(vectorSyncQueue).values(outboxPayloads);
    });
  }

 // Return formatted array matching the Zod KnowledgeObjectSchema structure expected by callers
 return koValues.map(ko => ({
 conceptName: ko.conceptName,
 title: ko.title,
 content: ko.content,
 type: ko.type,
 difficulty: ko.difficulty,
 bloomLevel: ko.bloomLevel,
 tags: ko.tags,
 importance: ko.importance,
 metadata: ko.metadata,
 }));
}
