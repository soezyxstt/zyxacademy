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
