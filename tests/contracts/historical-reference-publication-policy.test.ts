import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";

let mockSession: any = null;

const { client, testDb } = await createPostgresTestDb();

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
  },
}));
mock.module("@/lib/auth/authorization", () => ({
  hasAnyPeran: async () => true,
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));
mock.module("@/lib/question-authoring", () => ({
  createCanonicalQuestion: async () => {
    throw new Error("not used in this contract");
  },
  QuestionAuthoringError: class QuestionAuthoringError extends Error {},
}));

import { PUT } from "@/app/api/admin/questions/route";

describe("Historical reference publication policy", () => {
  afterAll(async () => { await client.close(); });

  beforeEach(async () => {
    await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah CASCADE');
    mockSession = { user: { id: "admin-1", role: "admin" } };
    await testDb.insert(schema.user).values({ id: "admin-1", name: "Admin", email: "admin@example.test", role: "admin" });
    await testDb.insert(schema.pengguna).values({ id: "admin-1" });
    await testDb.insert(schema.courses).values({ id: "legacy-course-1", title: "Course", category: "Matematika" });
    await testDb.insert(schema.mataKuliah).values({ id: "course-1", code: "COURSE-1", title: "Course", legacyCourseId: "legacy-course-1" });
    await testDb.insert(schema.bab).values({ id: "chapter-1", mataKuliahId: "course-1", code: "CH-1", title: "Chapter", orderIndex: 0 });
  });

  it("blocks historical publication until a source and published Idea link exist", async () => {
    await testDb.insert(schema.soal).values({
      id: "historical-1", mataKuliahId: "course-1", origin: "historical_reference",
      questionType: "multiple_choice", prompt: "Question", optionsSnapshot: [], status: "draft",
      difficulty: "medium", cognitiveLevel: "apply", reasoningPattern: "direct",
      generationHash: "question-hash", creatorId: "admin-1",
    });
    await testDb.insert(schema.aiQuestionBank).values({
      id: "historical-1", origin: "historical_reference", reviewStatus: "generated",
      courseId: "legacy-course-1", prompt: "Question", options: [], correctIndices: [], explanation: "Explanation",
    });
    await testDb.insert(schema.pembahasanSoal).values({
      id: "solution-1", soalId: "historical-1", status: "draft", content: "Solution",
      generationHash: "solution-hash", creatorId: "admin-1",
    });

    const blocked = await PUT(
      new NextRequest("http://localhost/api/admin/questions", {
        method: "PUT",
        body: JSON.stringify({ ids: ["historical-1"], reviewStatus: "published" }),
      }),
    );

    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toMatchObject({
      code: "HISTORICAL_PUBLICATION_REQUIREMENTS_NOT_MET",
      questionIds: ["historical-1"],
    });

    const [stillDraft] = await testDb
      .select({ status: schema.soal.status })
      .from(schema.soal)
      .where(eq(schema.soal.id, "historical-1"));
    expect(stillDraft?.status).toBe("draft");

    await testDb.insert(schema.assessmentSources).values({
      id: "source-1", courseId: "legacy-course-1", title: "Source", category: "quiz",
      sourceMarkdown: "Source", sourceHash: "source-hash", uploadedByUserId: "admin-1",
    });
    await testDb.update(schema.soal).set({ assessmentSourceId: "source-1" }).where(eq(schema.soal.id, "historical-1"));
    await testDb.insert(schema.ide).values({
      id: "idea-1", mataKuliahId: "course-1", babId: "chapter-1", stableKey: "idea-1", code: "IDEA-1",
      canonicalStatement: "Idea", conciseExplanation: "Explanation", status: "published",
      semanticHash: "semantic-hash", generationHash: "idea-hash", creatorId: "admin-1",
    });
    await testDb.insert(schema.soalIde).values({ id: "link-1", soalId: "historical-1", ideId: "idea-1", weight: 1 });

    const published = await PUT(
      new NextRequest("http://localhost/api/admin/questions", {
        method: "PUT",
        body: JSON.stringify({ ids: ["historical-1"], reviewStatus: "published" }),
      }),
    );

    expect(published.status).toBe(200);
    expect(await published.json()).toEqual({ updated: 1 });

    const [canonical] = await testDb
      .select({ status: schema.soal.status })
      .from(schema.soal)
      .where(eq(schema.soal.id, "historical-1"));
    const [compatibility] = await testDb
      .select({ reviewStatus: schema.aiQuestionBank.reviewStatus })
      .from(schema.aiQuestionBank)
      .where(eq(schema.aiQuestionBank.id, "historical-1"));
    expect(canonical?.status).toBe("published");
    expect(compatibility?.reviewStatus).toBe("published");
  });
});
