import { DiktatStructure, DiktatChapter, DiktatConcept } from "./diktat-generator";
import { generateContentWithFallback } from "./gemini";
import { USE_CASES } from "@/lib/ai-router";

/**
 * Parses JSON from Gemini responses that may contain unescaped LaTeX backslashes.
 * JSON.parse fails on sequences like \Delta, \sqrt, \frac because they are not
 * valid JSON escape sequences. This helper sanitizes them before parsing.
 */
function safeParseJson<T>(text: string): T | null {
 const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
 if (!jsonMatch) return null;

 const raw = jsonMatch[0];

 try {
 return JSON.parse(raw) as T;
 } catch {
 // Sanitize: walk char-by-char and double any backslash not part of a valid JSON escape
 let sanitized = "";
 let i = 0;
 const validEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
 while (i < raw.length) {
 if (raw[i] === '\\') {
 const next = raw[i + 1] ?? '';
 if (validEscapeChars.has(next)) {
 // Valid JSON escape: keep both chars
 sanitized += raw[i];
 sanitized += next;
 i += 2;
 } else {
 // Bad escape (e.g. \D from \Delta, \s from \sqrt): double the backslash
 sanitized += '\\\\';
 i++;
 }
 } else {
 sanitized += raw[i];
 i++;
 }
 }
 try {
 return JSON.parse(sanitized) as T;
 } catch {
 return null;
 }
 }
}

export interface ConceptImportanceScore {
 conceptName: string;
 stars: 1 | 2 | 3 | 4 | 5;
 label: "Essential" | "Frequently Tested" | "Important" | "Supplemental" | "Reference";
}

export interface ExamPattern {
 conceptName: string;
 steps: string[];
 sourceKoIds: string[];
}

export interface QuickMethod {
 conceptName: string;
 title: string;
 rules: string[];
 sourceKoIds: string[];
}

export interface ExamTrap {
 conceptName: string;
 wrong: string;
 correct: string;
 why: string;
 sourceKoId: string;
}

export interface ReviewChecklist {
 chapterId: string;
 chapterTitle: string;
 items: string[];
}

export interface ExamIntelligenceData {
 importanceScores: ConceptImportanceScore[];
 examPatterns: ExamPattern[];
 quickMethods: QuickMethod[];
 examTraps: ExamTrap[];
 reviewChecklists: ReviewChecklist[];
 studyOrder: string[];
}

type KO = {
 id: string;
 conceptName: string;
 type: string | null;
 title: string;
 content: string;
 difficulty: string | null;
 importance: string | null;
 metadata: any;
 chapterId: string;
 learningOrder: number;
};

const STAR_LABELS: Record<number, ConceptImportanceScore["label"]> = {
 1: "Reference",
 2: "Supplemental",
 3: "Important",
 4: "Frequently Tested",
 5: "Essential",
};

export function computeImportanceScores(
 chapters: DiktatChapter[],
 allKOs: KO[],
 relationships: Map<string, string[]>
): ConceptImportanceScore[] {
 const scores: ConceptImportanceScore[] = [];

 // Count incoming prerequisites per concept (how many other KOs depend on this concept)
 const incomingPrerequisites = new Map<string, number>();
 for (const ko of allKOs) {
 const targets = relationships.get(ko.id) || [];
 for (const targetId of targets) {
 const targetKO = allKOs.find(k => k.id === targetId);
 if (targetKO) {
 incomingPrerequisites.set(
 targetKO.conceptName,
 (incomingPrerequisites.get(targetKO.conceptName) || 0) + 1
 );
 }
 }
 }

 for (const chapter of chapters) {
 for (const concept of chapter.concepts) {
 const conceptKOs = allKOs.filter(k => k.conceptName === concept.conceptName);

 const formulaCount = concept.formulas.length;
 const misconceptionCount = concept.misconceptions.length;
 const exampleCount = concept.examples.length;
 const highImportanceKOCount = conceptKOs.filter(k => k.importance === "high").length;
 const prerequisiteImportance = incomingPrerequisites.get(concept.conceptName) || 0;

 const raw =
 formulaCount * 1.5 +
 misconceptionCount * 2.0 +
 exampleCount * 0.5 +
 highImportanceKOCount * 2.5 +
 prerequisiteImportance * 2.0;

 const stars = (
 raw >= 11 ? 5 :
 raw >= 8 ? 4 :
 raw >= 5 ? 3 :
 raw >= 3 ? 2 : 1
 ) as 1 | 2 | 3 | 4 | 5;

 scores.push({
 conceptName: concept.conceptName,
 stars,
 label: STAR_LABELS[stars],
 });
 }
 }

 return scores;
}

export function extractExamTraps(chapters: DiktatChapter[]): ExamTrap[] {
 const traps: ExamTrap[] = [];

 for (const chapter of chapters) {
 for (const concept of chapter.concepts) {
 for (const m of concept.misconceptions) {
 traps.push({
 conceptName: concept.conceptName,
 wrong: m.myth || m.title,
 correct: m.correction,
 why: m.rationale,
 sourceKoId: m.koId,
 });
 }
 }
 }

 return traps;
}

export function buildReviewChecklists(
 structure: DiktatStructure,
 allKOs: KO[]
): ReviewChecklist[] {
 const checklists: ReviewChecklist[] = [];

 for (const chapter of structure.chapters) {
 const objectiveKOs = allKOs.filter(
 k => k.chapterId === chapter.id && k.type === "objective"
 );

 const items: string[] = objectiveKOs.map(k =>
 k.content.replace(/^[-*]\s*/, "").trim()
 );

 // For concepts with no objective KO, add a generic checklist item
 const conceptsWithObjectives = new Set(objectiveKOs.map(k => k.conceptName));
 for (const concept of chapter.concepts) {
 if (!conceptsWithObjectives.has(concept.conceptName)) {
 if (concept.formulas.length > 0) {
 items.push(`Menerapkan rumus ${concept.conceptName} dalam soal ujian`);
 } else {
 items.push(`Menjelaskan konsep ${concept.conceptName}`);
 }
 }
 }

 if (items.length > 0) {
 checklists.push({
 chapterId: chapter.id,
 chapterTitle: chapter.title,
 items,
 });
 }
 }

 return checklists;
}

async function generateExamPatternsAI(chapters: DiktatChapter[]): Promise<ExamPattern[]> {
 const patterns: ExamPattern[] = [];

 // Only procedural concepts (have formulas or examples)
 const proceduralConcepts: { concept: DiktatConcept; koIds: string[] }[] = [];
 for (const chapter of chapters) {
 for (const concept of chapter.concepts) {
 if (concept.formulas.length > 0 || concept.examples.length > 0) {
 proceduralConcepts.push({
 concept,
 koIds: [
 ...concept.formulas.map(f => f.koId),
 ...concept.examples.map(e => e.koId),
 ],
 });
 }
 }
 }

 if (proceduralConcepts.length === 0) return patterns;

 const BATCH_SIZE = 5;
 for (let i = 0; i < proceduralConcepts.length; i += BATCH_SIZE) {
 const batch = proceduralConcepts.slice(i, i + BATCH_SIZE);

 const conceptDescriptions = batch.map(({ concept }) => {
 // Use formula titles only ; no LaTeX to avoid bad JSON escapes in Gemini response
 const formulaList = concept.formulas.map(f => `- ${f.title}`).join("\n");
 const exampleNote = concept.examples.length > 0 ? `\nContoh: ${concept.examples[0].title}` : "";
 return `Konsep: ${concept.conceptName}\nRumus:\n${formulaList}${exampleNote}`;
 }).join("\n\n---\n\n");

 const prompt = `Kamu adalah tutor yang membantu mahasiswa mempersiapkan ujian.

Untuk setiap konsep, berikan langkah-langkah prosedural (exam pattern) yang perlu dikuasai untuk mengerjakan soal ujian. Setiap langkah singkat dan actionable.

PENTING: Gunakan teks biasa saja dalam output JSON. Jangan gunakan simbol LaTeX, backslash, atau formula matematika. Tulis nama formula dengan kata, bukan simbol.

Format output sebagai JSON array:
[
 {
 "conceptName": "...",
 "steps": ["langkah 1", "langkah 2", "..."]
 }
]

Konsep:
${conceptDescriptions}

Berikan hanya JSON array.`;

 try {
  const { response } = await generateContentWithFallback({ useCase: USE_CASES.DIKTAT_EXAM_PATTERNS, contents: prompt });
  const text: string = typeof response.text === "function" ? response.text() : response.text;
  const parsed = safeParseJson<{ conceptName: string; steps: string[] }[]>(text);
 if (!parsed) continue;

 for (const item of parsed) {
 const match = batch.find(b => b.concept.conceptName === item.conceptName);
 if (match && Array.isArray(item.steps)) {
 patterns.push({
 conceptName: item.conceptName,
 steps: item.steps.filter((s): s is string => typeof s === "string" && s.trim() !== ""),
 sourceKoIds: match.koIds,
 });
 }
 }
 } catch (err) {
 console.warn(`[diktat-exam-intelligence] generateExamPatterns batch ${i} failed:`, err);
 }
 }

 return patterns;
}

async function generateQuickMethodsAI(chapters: DiktatChapter[]): Promise<QuickMethod[]> {
 const methods: QuickMethod[] = [];

 const summarizableConcepts: { concept: DiktatConcept; koIds: string[] }[] = [];
 for (const chapter of chapters) {
 for (const concept of chapter.concepts) {
 if (concept.definitions.length > 0 || concept.formulas.length > 0) {
 summarizableConcepts.push({
 concept,
 koIds: [
 ...concept.definitions.map(d => d.koId),
 ...concept.formulas.map(f => f.koId),
 ],
 });
 }
 }
 }

 if (summarizableConcepts.length === 0) return methods;

 const BATCH_SIZE = 5;
 for (let i = 0; i < summarizableConcepts.length; i += BATCH_SIZE) {
 const batch = summarizableConcepts.slice(i, i + BATCH_SIZE);

 const conceptDescriptions = batch.map(({ concept }) => {
 // Strip LaTeX from definition summary to keep prompt safe
 const rawDef = concept.definitions.length > 0
 ? concept.definitions[0].content.substring(0, 200)
 : "";
 const defSummary = rawDef.replace(/\$\$[\s\S]*?\$\$/g, "[formula]").replace(/\$[^$]+\$/g, "[expr]");
 const formulaNames = concept.formulas.map(f => `- ${f.title}`).join("\n");
 return `Konsep: ${concept.conceptName}\nDefinisi: ${defSummary}\nRumus:\n${formulaNames}`;
 }).join("\n\n---\n\n");

 const prompt = `Kamu adalah tutor yang membantu mahasiswa review cepat sebelum ujian.

Untuk setiap konsep, berikan "Quick Method" berupa aturan singkat yang bisa diingat dengan cepat saat ujian.

PENTING: Gunakan teks biasa saja dalam output JSON. Jangan gunakan simbol LaTeX, backslash, atau formula matematika. Tulis nama rumus/simbol dengan kata biasa.

Format output sebagai JSON array:
[
 {
 "conceptName": "...",
 "title": "Cara Cepat [nama]",
 "rules": ["aturan 1", "aturan 2", "..."]
 }
]

Konsep:
${conceptDescriptions}

Berikan hanya JSON array.`;

 try {
  const { response } = await generateContentWithFallback({ useCase: USE_CASES.DIKTAT_QUICK_METHODS, contents: prompt });
  const text: string = typeof response.text === "function" ? response.text() : response.text;
  const parsed = safeParseJson<{ conceptName: string; title: string; rules: string[] }[]>(text);
 if (!parsed) continue;

 for (const item of parsed) {
 const match = batch.find(b => b.concept.conceptName === item.conceptName);
 if (match && Array.isArray(item.rules)) {
 methods.push({
 conceptName: item.conceptName,
 title: item.title || `Cara Cepat ${item.conceptName}`,
 rules: item.rules.filter((r): r is string => typeof r === "string" && r.trim() !== ""),
 sourceKoIds: match.koIds,
 });
 }
 }
 } catch (err) {
 console.warn(`[diktat-exam-intelligence] generateQuickMethods batch ${i} failed:`, err);
 }
 }

 return methods;
}

export async function generateExamIntelligence(
 structure: DiktatStructure,
 allKOs: KO[],
 relationships: Map<string, string[]>
): Promise<ExamIntelligenceData> {
 // Deterministic layers (always run)
 const importanceScores = computeImportanceScores(structure.chapters, allKOs, relationships);
 const examTraps = extractExamTraps(structure.chapters);
 const reviewChecklists = buildReviewChecklists(structure, allKOs);

 // Build study order: sort by importanceScore DESC, then minLearningOrder ASC
 const scoreMap = new Map(importanceScores.map(s => [s.conceptName, s.stars]));
 const allConcepts = structure.chapters.flatMap(ch =>
 ch.concepts.map(c => ({
 conceptName: c.conceptName,
 stars: scoreMap.get(c.conceptName) || 1,
 minLearningOrder: c.minLearningOrder,
 }))
 );
 allConcepts.sort((a, b) =>
 b.stars !== a.stars ? b.stars - a.stars : a.minLearningOrder - b.minLearningOrder
 );
 const studyOrder = allConcepts.map(c => c.conceptName);

 // AI layers (gated on FEATURE_DIKTAT_AI=1)
 let examPatterns: ExamPattern[] = [];
 let quickMethods: QuickMethod[] = [];

 if (process.env.FEATURE_DIKTAT_AI === "1") {
 console.log("[diktat-exam-intelligence] generateExamPatterns (AI)");
 [examPatterns, quickMethods] = await Promise.all([
 generateExamPatternsAI(structure.chapters).catch(err => {
 console.warn("[diktat-exam-intelligence] examPatterns AI failed:", err);
 return [] as ExamPattern[];
 }),
 generateQuickMethodsAI(structure.chapters).catch(err => {
 console.warn("[diktat-exam-intelligence] quickMethods AI failed:", err);
 return [] as QuickMethod[];
 }),
 ]);
 }

 return { importanceScores, examPatterns, quickMethods, examTraps, reviewChecklists, studyOrder };
}
