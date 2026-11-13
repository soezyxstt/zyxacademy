import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  CANONICAL_VECTOR_PROFILE,
  createVersionedVectorId,
  type CanonicalVectorMetadata,
} from "@/lib/vectorize/contracts";
import {
  hydrateCanonicalCandidates,
  runCanonicalRuntimeFailClosed,
  type CanonicalHydrationRecord,
  type CanonicalRuntimeCandidate,
} from "@/lib/zyra/canonical-runtime";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidate(input: Partial<CanonicalVectorMetadata> = {}): CanonicalRuntimeCandidate {
  const metadata: CanonicalVectorMetadata = {
    namespace: "canonical_ideas",
    entityType: "idea",
    entityId: "idea-1",
    version: 2,
    status: "published",
    accessClass: "enrolled",
    language: "id",
    profileId: CANONICAL_VECTOR_PROFILE.id,
    courseId: "course-1",
    chapterId: "chapter-1",
    ...input,
  };
  return {
    id: createVersionedVectorId(metadata.entityType, metadata.entityId, metadata.version),
    score: 0.91,
    metadata,
  };
}

function record(input: Partial<CanonicalHydrationRecord> = {}): CanonicalHydrationRecord {
  const content = input.content ?? "Definisi konsep canonical.";
  return {
    namespace: "canonical_ideas",
    entityType: "idea",
    entityId: "idea-1",
    version: 2,
    status: "published",
    accessClass: "enrolled",
    courseId: "course-1",
    chapterId: "chapter-1",
    title: "Idea 1",
    content,
    contentHash: hash(content),
    href: "/courses/course-1/material",
    ...input,
  };
}

const studyRequest = {
  courseId: "course-1",
  chapterId: "chapter-1",
  isEnrolled: true,
  activityKind: "study" as const,
  attemptState: "none" as const,
  answerReleaseState: "released" as const,
  matchState: "none" as const,
};

describe("Plan 013 Zyra canonical runtime", () => {
  it("withholds raw or repeatedly encoded historical Article formative payloads from tutor hydration", () => {
    const article = candidate({ namespace: "published_articles", entityType: "article", entityId: "article-1" });
    let content = JSON.stringify({ content: "Prompt", formativeCheckPayload: { answer: "private" } });
    for (let depth = 0; depth < 4; depth++) {
      const result = hydrateCanonicalCandidates([article], [record({ namespace: "published_articles", entityType: "article", entityId: "article-1", content })], studyRequest);
      expect(result.sources).toHaveLength(0);
      expect(result.rejected[0]?.reasonCode).toBe("PRIVATE_ARTICLE_PAYLOAD");
      content = JSON.stringify(content);
    }
    expect(hydrateCanonicalCandidates([article], [record({ namespace: "published_articles", entityType: "article", entityId: "article-1", content: "Prompt dan pilihan publik" })], studyRequest).sources).toHaveLength(1);
    const mixed = hydrateCanonicalCandidates([article], [record({ namespace: "published_articles", entityType: "article", entityId: "article-1", content: 'Intro\n{"content":"Question","answer":"private","isCorrect":true}' })], studyRequest);
    expect(mixed.sources).toHaveLength(0);
    expect(mixed.rejected[0]?.reasonCode).toBe("PRIVATE_ARTICLE_PAYLOAD");
    const ordinary = hydrateCanonicalCandidates([article], [record({ namespace: "published_articles", entityType: "article", entityId: "article-1", content: 'Kolom "content": isi pesan' })], studyRequest);
    expect(ordinary.sources).toHaveLength(1);
  });

  it("hydrates only the current, course-scoped canonical row", () => {
    const result = hydrateCanonicalCandidates([candidate()], [record()], studyRequest);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      id: "v2:idea:idea-1:2",
      entityType: "idea",
      type: "ko",
      content: "Definisi konsep canonical.",
    });
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects stale versions, superseded rows, hash drift, and wrong course scope", () => {
    const stale = hydrateCanonicalCandidates(
      [candidate()],
      [record({ version: 3 })],
      studyRequest,
    );
    const superseded = hydrateCanonicalCandidates(
      [candidate()],
      [record({ status: "superseded" })],
      studyRequest,
    );
    const hashDrift = hydrateCanonicalCandidates(
      [candidate({ contentHash: hash("different") })],
      [record()],
      studyRequest,
    );
    const wrongCourse = hydrateCanonicalCandidates(
      [candidate({ courseId: "course-2" })],
      [record({ courseId: "course-2" })],
      studyRequest,
    );

    expect(stale.rejected[0]?.reasonCode).toBe("VERSION_MISMATCH");
    expect(superseded.rejected[0]?.reasonCode).toBe("STALE_OR_SUPERSEDED");
    expect(hashDrift.rejected[0]?.reasonCode).toBe("CONTENT_HASH_MISMATCH");
    expect(wrongCourse.rejected[0]?.reasonCode).toBe("COURSE_SCOPE_MISMATCH");
  });

  it("requires enrollment for enrolled content", () => {
    const result = hydrateCanonicalCandidates([candidate()], [record()], {
      ...studyRequest,
      isEnrolled: false,
    });

    expect(result.sources).toHaveLength(0);
    expect(result.rejected[0]?.reasonCode).toBe("NOT_ENROLLED");
  });

  it("limits Free evidence to the first two chapters and excludes unscoped or locked answers", () => {
    const freeRequest = {
      ...studyRequest,
      chapterId: null,
      isEnrolled: false,
      accessTier: "free" as const,
      freeChapterIds: ["chapter-1", "chapter-2"],
      capability: "read:published_solutions" as const,
      answerReleaseState: "released" as const,
    };
    const allowedContent = "Konsep yang tersedia untuk Free.";
    const allowedCandidate = candidate({
      entityId: "idea-free",
      chapterId: "chapter-2",
      contentHash: hash(allowedContent),
    });
    const chapterThreeCandidate = candidate({
      entityId: "idea-chapter-3",
      chapterId: "chapter-3",
      contentHash: hash("Bab tiga terkunci."),
    });
    const unscopedCandidate = candidate({
      entityId: "idea-unscoped",
      chapterId: undefined,
      contentHash: hash("Konten tanpa bab."),
    });
    const unscopedCourseCandidate = candidate({
      entityId: "idea-unscoped-course",
      chapterId: "chapter-1",
      courseId: undefined,
      contentHash: hash("Konten tanpa mata kuliah."),
    });
    const lockedCandidate = candidate({
      entityId: "idea-locked",
      chapterId: "chapter-1",
      accessClass: "admin",
      contentHash: hash("Konten admin."),
    });
    const answerCandidate = candidate({
      namespace: "published_solutions",
      entityType: "solution",
      entityId: "solution-free",
      version: 1,
      status: "published",
      accessClass: "restricted_solution",
      chapterId: "chapter-1",
      contentHash: hash("Jawaban yang tidak boleh masuk."),
    });

    const result = hydrateCanonicalCandidates(
      [allowedCandidate, chapterThreeCandidate, unscopedCandidate, unscopedCourseCandidate, lockedCandidate, answerCandidate],
      [
        record({ entityId: "idea-free", chapterId: "chapter-2", content: allowedContent }),
        record({ entityId: "idea-chapter-3", chapterId: "chapter-3", content: "Bab tiga terkunci." }),
        record({ entityId: "idea-unscoped", chapterId: undefined, content: "Konten tanpa bab." }),
        record({ entityId: "idea-unscoped-course", chapterId: "chapter-1", courseId: undefined, content: "Konten tanpa mata kuliah." }),
        record({ entityId: "idea-locked", chapterId: "chapter-1", accessClass: "admin", content: "Konten admin." }),
        record({
          namespace: "published_solutions",
          entityType: "solution",
          entityId: "solution-free",
          version: 1,
          accessClass: "restricted_solution",
          chapterId: "chapter-1",
          content: "Jawaban yang tidak boleh masuk.",
        }),
      ],
      freeRequest,
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ entityType: "idea", content: allowedContent });
    expect(result.rejected).toEqual(expect.arrayContaining([
      { id: chapterThreeCandidate.id, reasonCode: "CHAPTER_SCOPE_MISMATCH" },
      { id: unscopedCandidate.id, reasonCode: "CHAPTER_SCOPE_MISMATCH" },
      { id: unscopedCourseCandidate.id, reasonCode: "CHAPTER_SCOPE_MISMATCH" },
      { id: lockedCandidate.id, reasonCode: "NOT_ENROLLED" },
      { id: answerCandidate.id, reasonCode: "ACTIVE_ATTEMPT_ANSWER_DENIED" },
    ]));
  });

  it("keeps question content answer-safe during an active assessment", () => {
    const questionContent = "Apa definisi konsep ini?\n\nOptions: [\"A\",\"B\"]";
    const questionCandidate = candidate({
      namespace: "published_questions",
      entityType: "question",
      entityId: "question-1",
      version: 1,
      status: "published",
      contentHash: hash(questionContent),
    });
    const result = hydrateCanonicalCandidates(
      [questionCandidate],
      [record({
        namespace: "published_questions",
        entityType: "question",
        entityId: "question-1",
        version: 1,
        title: "Published question",
        content: questionContent,
        safeContent: "Apa definisi konsep ini?",
        contentHash: hash(questionContent),
      })],
      {
        ...studyRequest,
        activityKind: "quiz",
        attemptState: "in_progress",
        answerReleaseState: "hidden",
        matchState: "exact",
      },
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.content).toBe("Apa definisi konsep ini?");
    expect(result.sources[0]?.content).not.toContain("Options");
  });

  it("blocks solutions without capability and during active attempts", () => {
    const solution = "Langkah penyelesaian dan jawaban akhir.";
    const solutionCandidate = candidate({
      namespace: "published_solutions",
      entityType: "solution",
      entityId: "solution-1",
      version: 1,
      status: "published",
      accessClass: "restricted_solution",
      contentHash: hash(solution),
    });
    const solutionRecord = record({
      namespace: "published_solutions",
      entityType: "solution",
      entityId: "solution-1",
      version: 1,
      status: "published",
      accessClass: "restricted_solution",
      content: solution,
      contentHash: hash(solution),
    });

    const noCapability = hydrateCanonicalCandidates([solutionCandidate], [solutionRecord], studyRequest);
    const activeAttempt = hydrateCanonicalCandidates([solutionCandidate], [solutionRecord], {
      ...studyRequest,
      capability: "read:published_solutions",
      activityKind: "quiz",
      attemptState: "in_progress",
      answerReleaseState: "hidden",
      matchState: "exact",
    });
    const released = hydrateCanonicalCandidates([solutionCandidate], [solutionRecord], {
      ...studyRequest,
      capability: "read:published_solutions",
    });

    expect(noCapability.rejected[0]?.reasonCode).toBe("CAPABILITY_REQUIRED");
    expect(activeAttempt.rejected[0]?.reasonCode).toBe("ACTIVE_ATTEMPT_ANSWER_DENIED");
    expect(released.sources[0]?.content).toBe(solution);
  });
});

describe("canonical Zyra runtime failure boundary", () => {
  it("returns a stable masked failure without logging database details", async () => {
    const original = console.error;
    const logs: string[] = [];
    console.error = (...values: unknown[]) => {
      logs.push(values.map(String).join(" "));
    };

    try {
      const result = await runCanonicalRuntimeFailClosed("retrieve", async () => {
        throw new Error("DrizzleQueryError secret-database-url");
      });
      expect(result.sources).toEqual([]);
      expect(result.rejected).toEqual([]);
      expect(result.failure).toEqual({
        reasonCode: "CANONICAL_RUNTIME_UNAVAILABLE",
        operation: "retrieve",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("CANONICAL_RUNTIME_UNAVAILABLE");
      expect(logs[0]).not.toContain("DrizzleQueryError");
      expect(logs[0]).not.toContain("secret-database-url");
    } finally {
      console.error = original;
    }
  });
});
