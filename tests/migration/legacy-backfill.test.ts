import { describe, expect, it } from "bun:test";
import {
  attributeLegacyConceptMastery,
  createCompatibilityException,
  mapLegacyArticle,
  mapLegacyChapter,
  mapLegacyCourse,
  mapLegacyFlashcard,
  mapLegacyIdea,
  mapLegacyQuestion,
  mapLegacyRelation,
  stableChecksum,
  stableExceptionId,
  stableJoinId,
  stableStringify,
  stableTargetId,
} from "@/lib/migrasi/pemetaan-legacy";

const typicalCourse = {
  id: "course-pka",
  title: "Tutorial PKA",
  code: "PKA",
  category: "PKA",
  status: "active",
};

const typicalChapter = {
  id: "chapter-pka-1",
  courseId: "course-pka",
  title: "Pengantar",
  code: "BAB-1",
  orderIndex: 1,
  status: "active",
};

const typicalIdea = {
  id: "ko-pka-1",
  courseId: "course-pka",
  chapterId: "chapter-pka-1",
  conceptId: "concept-pka",
  title: "Konsep dasar",
  conceptName: "Konsep dasar",
  content: "Konsep dasar PKA.",
  type: "definition",
  status: "active",
};

describe("Plan 005 pure legacy mapping contract", () => {
  it("handles empty fixture collections without database access", () => {
    const empty: readonly unknown[] = [];
    expect(empty.map((row) => row)).toEqual([]);
    expect(stableStringify({ rows: empty })).toBe('{"rows":[]}');
  });

  it("maps a typical course, chapter, Idea, article, flashcard, question, and relation", () => {
    const course = mapLegacyCourse(typicalCourse);
    const chapter = mapLegacyChapter(typicalChapter, { targetCourseId: course.id });
    const idea = mapLegacyIdea(typicalIdea, {
      targetCourseId: course.id,
      targetChapterId: chapter.id,
      targetConceptId: "concept-pka",
      creatorId: "user-tutor",
    });
    const article = mapLegacyArticle({
      id: "material-pka-1",
      courseId: typicalCourse.id,
      chapterId: typicalChapter.id,
      sourceMtdId: "mtd-pka-1",
      sourceMtdVersion: 1,
      title: "Pengantar PKA",
      canonicalMarkdown: "# Pengantar\n\nIsi.",
      structuredContent: [{ key: "intro", type: "markdown", content: "# Pengantar\n\nIsi." }],
      creatorId: "user-tutor",
    }, { targetCourseId: course.id, targetChapterId: chapter.id });
    const flashcard = mapLegacyFlashcard({
      id: "card-pka-1",
      setId: "set-pka-1",
      koId: typicalIdea.id,
      front: "Apa itu PKA?",
      back: "Program Kegiatan Akademik.",
    }, { targetSetId: "set-target-1", ideaIdForKo: idea.id });
    const question = mapLegacyQuestion({
      id: "question-pka-1",
      courseId: typicalCourse.id,
      chapterId: typicalChapter.id,
      prompt: "Pilih definisi yang tepat.",
      exactIdeaId: idea.id,
    }, { targetCourseId: course.id, targetChapterId: chapter.id });
    const relation = mapLegacyRelation({
      id: "relation-pka-1",
      sourceKoId: typicalIdea.id,
      targetKoId: "ko-pka-2",
      type: "prerequisite",
    }, { sourceIdeaId: idea.id, targetIdeaId: "idea-pka-2" });

    expect(course.targetTable).toBe("mata_kuliah");
    expect(chapter.mataKuliahId).toBe(course.id);
    expect(idea.babId).toBe(chapter.id);
    expect(article.transformation).toBe("lossless_ast");
    expect(article.blocks[0].reviewStatus).toBe("lossless");
    expect(flashcard.ideaLink).toEqual({
      id: stableJoinId("flashcard_ide", flashcard.id, idea.id),
      ideId: idea.id,
      weight: 1,
    });
    expect(question.masteryEvidenceAllowed).toBe(true);
    expect(question.ideaLinks[0].mappingStatus).toBe("exact");
    expect(relation.relationType).toBe("prerequisite");
    expect(relation.exception).toBeUndefined();
  });

  it("repeats deterministic checksums, join IDs, and exception IDs exactly", () => {
    const value = { z: 1, nested: { b: 2, a: 1 }, a: ["x", "y"] };
    expect(stableChecksum(value)).toBe(stableChecksum({ a: ["x", "y"], nested: { a: 1, b: 2 }, z: 1 }));
    expect(stableJoinId("soal_ide", "question-1", "idea-1")).toBe(
      stableJoinId("soal_ide", "question-1", "idea-1"),
    );
    expect(stableExceptionId("legacy_table", "row-1", "ORPHAN_REFERENCE")).toBe(
      stableExceptionId("legacy_table", "row-1", "ORPHAN_REFERENCE"),
    );
    const exception = createCompatibilityException({
      legacyTable: "example",
      legacyId: "row-1",
      reasonCode: "UNSUPPORTED_CONTENT",
      reason: "fixture",
      preservationPath: "legacy:example:row-1",
      blocksCutover: false,
      source: value,
    });
    expect(exception.id).toBe(stableExceptionId("example", "row-1", "UNSUPPORTED_CONTENT"));
    expect(exception.sourceChecksum).toBe(stableChecksum(value));
  });

  it("handles duplicate target IDs with deterministic collision-safe IDs", () => {
    const existing = new Set(["legacy-course", "legacy-" + "a".repeat(32)]);
    const first = stableTargetId("courses", "legacy-course", existing);
    const second = stableTargetId("courses", "legacy-course", new Set([...existing, first]));
    expect(first).not.toBe("legacy-course");
    expect(second).not.toBe(first);
    expect(stableTargetId("courses", "legacy-course", existing)).toBe(first);
    expect(stableTargetId("courses", "fresh-course", existing)).toBe("fresh-course");
  });

  it("marks fallback assessment mappings ambiguous and disallows mastery evidence", () => {
    const mapped = mapLegacyQuestion({
      id: "question-ambiguous",
      courseId: "course-pka",
      chapterId: "chapter-pka-1",
      prompt: "Pertanyaan dengan fallback bab.",
      fallbackIdeaIds: ["idea-a", "idea-b", "idea-a"],
    });
    expect(mapped.mappingStatus).toBe("ambiguous");
    expect(mapped.masteryEvidenceAllowed).toBe(false);
    expect(mapped.ideaLinks.map((link) => link.mappingStatus)).toEqual(["ambiguous", "ambiguous"]);
    expect(mapped.ideaLinks.every((link) => link.evidenceEligible === false)).toBe(true);
    expect(mapped.exception?.reasonCode).toBe("AMBIGUOUS_ASSESSMENT_MAPPING");
    expect(mapped.exception?.blocksCutover).toBe(true);
  });

  it("records orphaned questions and flashcards instead of inventing target links", () => {
    const question = mapLegacyQuestion({
      id: "question-orphan",
      courseId: "course-pka",
      prompt: "Tidak punya mapping.",
    });
    const flashcard = mapLegacyFlashcard({
      id: "card-orphan",
      setId: "set-pka-1",
      koId: "missing-ko",
      front: "Front",
      back: "Back",
    });
    expect(question.ideaLinks).toEqual([]);
    expect(question.mappingStatus).toBe("unmapped");
    expect(question.exception?.reasonCode).toBe("ORPHAN_REFERENCE");
    expect(flashcard.ideaLink).toBeNull();
    expect(flashcard.mappingStatus).toBe("unmapped");
    expect(flashcard.exception?.preservationPath).toBe("legacy:flashcards:card-orphan");
  });

  it("preserves complete Markdown and marks an unrecognized AST for review", () => {
    const article = mapLegacyArticle({
      id: "material-unknown-ast",
      courseId: "course-pka",
      sourceMtdId: "mtd-pka-1",
      sourceMtdVersion: 2,
      title: "Materi lama",
      canonicalMarkdown: "# Utuh\n\nJangan hilang.",
      structuredContent: { unsupported: { nodes: [1, 2, 3] } },
      creatorId: "user-tutor",
    });
    expect(article.transformation).toBe("markdown_needs_review");
    expect(article.blocks).toHaveLength(1);
    expect(article.blocks[0].content).toBe(article.contentMarkdown);
    expect(article.blocks[0].reviewStatus).toBe("needs_review");
  });

  it("returns a blocking exception for unknown relation types", () => {
    const mapped = mapLegacyRelation({
      id: "relation-unknown",
      sourceKoId: "ko-a",
      targetKoId: "ko-b",
      type: "contains_but_not_translated",
    });
    expect(mapped.relationType).toBeNull();
    expect(mapped.mappingStatus).toBe("unmapped");
    expect(mapped.exception?.reasonCode).toBe("UNKNOWN_RELATION_TYPE");
    expect(mapped.exception?.blocksCutover).toBe(true);
  });

  it("keeps a PKA-like concept baseline separate until exact evidence exists", () => {
    const baseline = {
      id: "mastery-pka-1",
      studentId: "student-pka-1",
      courseId: "course-pka",
      conceptId: "concept-pka",
      conceptName: "Konsep PKA",
      masteryScore: 76,
      confidence: 4,
      evidenceCount: 9,
    };
    const noEvidence = attributeLegacyConceptMastery(baseline, [
      { ideaId: "idea-a", mappingStatus: "ambiguous", evidenceCount: 4 },
      { ideaId: "idea-b", mappingStatus: "exact", snapshotHash: "changed", expectedSnapshotHash: "original" },
    ]);
    expect(noEvidence.baseline.compatibilityOnly).toBe(true);
    expect(noEvidence.attributedIdeas).toEqual([]);
    expect(noEvidence.exception?.reasonCode).toBe("UNATTRIBUTABLE_MASTERY");
    expect(noEvidence.exception?.blocksCutover).toBe(false);

    const exactEvidence = attributeLegacyConceptMastery(baseline, [
      { ideaId: "idea-a", mappingStatus: "exact", evidenceCount: 2, snapshotHash: "same", expectedSnapshotHash: "same" },
      { ideaId: "idea-b", mappingStatus: "ambiguous", evidenceCount: 8 },
    ]);
    expect(exactEvidence.attributedIdeas).toHaveLength(1);
    expect(exactEvidence.attributedIdeas[0].ideaId).toBe("idea-a");
    expect(exactEvidence.attributedIdeas[0].derivedFromEvidence).toBe(true);
    expect(exactEvidence.attributedIdeas[0].evidenceCount).toBe(2);
    expect(exactEvidence.exception).toBeUndefined();
  });
});
