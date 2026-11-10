import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import * as s from "../../db/schema";

const { client, testDb } = await createPostgresTestDb();
let prefix = "", selectedConcept = "", failDispatch = false, sequence = 0;
const previousMock = process.env.MOCK_GEMINI;
mock.module("../../db", () => ({ db: testDb }));
mock.module("../../lib/gemini", () => ({
  generateContentWithFallback: async () => ({ response: { text: JSON.stringify({ questionType: "multiple_choice", difficulty: 1,
    applicationLevel: 1, concepts: [selectedConcept], pattern: "direct_computation", reasoningType: "procedural",
    estimatedSteps: 1, answerMarkdown: "2+3=5", options: ["5", "6"] }) } }),
  withGeminiRetry: async (callback: () => Promise<unknown>) => callback(),
  embedText: async () => Array(768).fill(0),
}));
mock.module("../../lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => {
  if (failDispatch) throw new Error("test failure after catalog creation");
} }));
const extractorModule = { ...await import("../../lib/assessment-extractor") };
const extract = extractorModule.extractAssessmentObjectsForSource;
const jobExtract = mock(async (_sourceId: string) => ({ status: "failed", objects: [], errors: ["controlled failure"],
  createdConcepts: [{ conceptId: "created-concept", localizationId: "created-localization" }] }));
mock.module("../../lib/assessment-extractor", () => ({ ...extractorModule, extractAssessmentObjectsForSource: jobExtract }));
mock.module("../../jobs/client", () => ({ inngest: { createFunction: (_options: unknown, handler: unknown) => handler } }));
const { assessmentIngestWorker } = await import("../../jobs/assessment");
const handler = assessmentIngestWorker as unknown as (context: { event: { data: { sourceId: string } }; step: { run: (id: string, callback: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;

beforeEach(async () => {
  prefix = `assessment-${++sequence}`;
  selectedConcept = `addition ${prefix}`; failDispatch = false;
  process.env.MOCK_GEMINI = "true";
  jobExtract.mockClear();
  await testDb.insert(s.user).values({ id: prefix, name: prefix, email: `${prefix}@example.invalid`, role: "teacher" });
  for (const course of [prefix, `${prefix}-foreign`]) {
    await testDb.insert(s.courses).values({ id: course, title: course, category: "Matematika" });
    await testDb.insert(s.chapters).values({ id: course, courseId: course, title: course, orderIndex: 1 });
    await testDb.insert(s.masterTeachingDocuments).values({ id: course, courseId: course, title: course,
      markdownContent: "Addition", createdById: prefix, status: "active" });
  }
  await testDb.insert(s.concepts).values({ id: prefix, canonicalSlug: prefix });
  await testDb.insert(s.conceptLocalizations).values({ id: prefix, conceptId: prefix, lang: "id", displayName: selectedConcept });
  for (const course of [prefix, `${prefix}-foreign`]) await testDb.insert(s.knowledgeObjects).values({ id: course, courseId: course,
    mtdId: course, chapterId: course, conceptId: prefix, learningOrder: 1, title: "Addition", conceptName: selectedConcept,
    content: "2+3=5", type: "formula", bloomLevel: "apply", status: "active" });
  await testDb.insert(s.assessmentSources).values({ id: prefix, courseId: prefix, title: prefix, category: "quiz",
    sourceMarkdown: "## Soal 1\nWhat is 2+3?", sourceHash: "a".repeat(64), uploadedByUserId: prefix });
});
afterAll(async () => {
  if (previousMock === undefined) delete process.env.MOCK_GEMINI; else process.env.MOCK_GEMINI = previousMock;
  await client.close();
});

test("assessment KO links stay in the source course despite a shared global concept", async () => {
  const result = await extract(prefix, false);
  expect(result.status).toBe("accepted");
  expect(result.createdConcepts).toEqual([]);
  expect(result.objects).toHaveLength(1);
  const links = await testDb.select().from(s.assessmentObjectKos).where(eq(s.assessmentObjectKos.assessmentObjectId, result.objects[0].id!));
  expect(links.map(link => link.koId)).toEqual([prefix]);
});

test("new global concept and localization IDs are returned as exact provenance", async () => {
  selectedConcept = `new concept ${prefix}`;
  const result = await extract(prefix, false);
  expect(result.createdConcepts).toHaveLength(1);
  const created = result.createdConcepts[0];
  const [concept] = await testDb.select().from(s.concepts).where(eq(s.concepts.id, created.conceptId));
  const [localization] = await testDb.select().from(s.conceptLocalizations).where(eq(s.conceptLocalizations.id, created.localizationId));
  expect(concept).toBeDefined();
  expect(localization.conceptId).toBe(concept.id);
  expect(localization.displayName).toBe(selectedConcept);
});

test("handled critical failure retains created catalog provenance", async () => {
  selectedConcept = `new concept ${prefix}`; failDispatch = true;
  const result = await extract(prefix, false);
  expect(result.status).toBe("failed");
  expect(result.createdConcepts).toHaveLength(1);
  const [source] = await testDb.select().from(s.assessmentSources).where(eq(s.assessmentSources.id, prefix));
  expect(source.ingestionStatus).toBe("failed");
  const retained = await testDb.select().from(s.concepts).where(eq(s.concepts.id, result.createdConcepts[0].conceptId));
  expect(retained).toHaveLength(1);
});

test("a localization failure cannot leave an untracked orphan concept", async () => {
  selectedConcept = `rejected concept ${prefix}`;
  await client.exec(`ALTER TABLE concept_localizations ADD CONSTRAINT reject_test_localization CHECK (display_name <> '${selectedConcept}')`);
  try {
    const result = await extract(prefix, false);
    expect(result.status).toBe("needs_review");
    expect(result.createdConcepts).toEqual([]);
    expect(await testDb.select().from(s.concepts).where(eq(s.concepts.canonicalSlug, selectedConcept.replace(/ /g, "-")))).toHaveLength(0);
  } finally { await client.exec("ALTER TABLE concept_localizations DROP CONSTRAINT reject_test_localization"); }
});

test("missing sources return failed status with empty provenance", async () => {
  expect(await extract("missing-assessment-source", false)).toMatchObject({ status: "failed", createdConcepts: [] });
});

test("failed extraction is memoized before the worker fails honestly", async () => {
  const cache = new Map<string, unknown>();
  const step = { run: async (id: string, callback: () => Promise<unknown>) => {
    if (!cache.has(id)) cache.set(id, await callback());
    return cache.get(id);
  } };
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(handler({ event: { data: { sourceId: prefix } }, step })).rejects.toThrow("ASSESSMENT_EXTRACTION_FAILED");
  }
  expect(jobExtract).toHaveBeenCalledTimes(1);
  expect(cache.get("extract-assessment-objects")).toMatchObject({ status: "failed", objectIds: [],
    createdConcepts: [{ conceptId: "created-concept", localizationId: "created-localization" }] });
});
