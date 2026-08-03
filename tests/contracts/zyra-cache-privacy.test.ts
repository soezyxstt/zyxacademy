import { describe, expect, it } from "bun:test";
import {
  assertNoStudentTextInSharedCache,
  buildTutorCacheKey,
  computeEvidenceVersion,
} from "@/lib/tutor/cache-contract";

describe("Plan 013 Zyra cache privacy", () => {
  it("keeps shared cache keys independent of student identity and conversation history", () => {
    const evidence = [{ id: "v2:idea:idea-1:2", content: "Konsep canonical" }];
    const evidenceVersion = computeEvidenceVersion(evidence);
    const first = buildTutorCacheKey({
      courseId: "course-1",
      chapterId: "chapter-1",
      academicQuery: "Apa definisi konsep ini?",
      evidenceVersion,
    });
    const second = buildTutorCacheKey({
      courseId: "course-1",
      chapterId: "chapter-1",
      academicQuery: "apa definisi konsep ini?",
      evidenceVersion,
    });

    expect(first).toBe(second);
    expect(first).not.toContain("student-1");
    expect(first).not.toContain("session-1");
  });

  it("accepts a profile-free canonical answer payload", () => {
    const key = buildTutorCacheKey({
      courseId: "course-1",
      chapterId: null,
      academicQuery: "jelaskan ide ini",
      evidenceVersion: "canonical-v2-evidence",
    });
    const payload = {
      answer: "Penjelasan dari Idea canonical.",
      sources: [{ type: "ko", id: "v2:idea:idea-1:2", label: "Idea 1", href: "/courses/course-1/material" }],
      matchedConcepts: ["Idea 1"],
      confidence: 0.9,
      grounded: true,
    };

    expect(() => assertNoStudentTextInSharedCache(key, payload, ["student-1", "session-1"])).not.toThrow();
  });

  it("fails closed when a student identifier or history token enters shared cache", () => {
    const key = buildTutorCacheKey({
      courseId: "course-1",
      chapterId: null,
      academicQuery: "jelaskan konsep",
    });

    expect(() => assertNoStudentTextInSharedCache(key, { answer: "history-token-42" }, ["history-token-42"])).toThrow();
    expect(() => assertNoStudentTextInSharedCache(key, { answer: "student-1" }, ["student-1"])).toThrow();
  });
});
