import { describe, expect, it } from "bun:test";

process.env.MOCK_GEMINI = "true";
import {
  planMaterialOutline,
  validatePreflightKos,
  serializeBlocksToMarkdown,
  compileArticleProduct,
  KOCompilerInput,
} from "@/lib/materials/compiler";
import { computeMaterialRevisionDiff } from "@/lib/materials/revision-diff";
import { ASTBlock } from "@/lib/ast-validator";

describe("Material Compiler Pipeline Contract Tests (Plan 009)", () => {
  it("AI-MAT-COMP-001: Preflight check rejects inactive or needs_review KOs", () => {
    const invalidKos: KOCompilerInput[] = [
      {
        id: "ko-1",
        title: "Konsep Active",
        type: "definition",
        content: "Penjelasan",
        difficulty: "easy",
        status: "active",
      },
      {
        id: "ko-2",
        title: "Konsep Needs Review",
        type: "definition",
        content: "Penjelasan",
        difficulty: "medium",
        status: "needs_review",
      },
    ];

    const preflight = validatePreflightKos(invalidKos);
    expect(preflight.valid).toBe(false);
    expect(preflight.errors.length).toBeGreaterThan(0);
    expect(preflight.errors[0]).toContain("needs_review");
  });

  it("AI-MAT-COMP-002: Outline planner detects duplicate KO titles and records typed exclusion", () => {
    const kos: KOCompilerInput[] = [
      {
        id: "ko-101",
        title: "Definisi Turunan",
        type: "definition",
        content: "Laju perubahan",
        difficulty: "easy",
        status: "active",
      },
      {
        id: "ko-102",
        title: "Definisi Turunan",
        type: "definition",
        content: "Limit f(x+h)",
        difficulty: "easy",
        status: "active",
      },
    ];

    const plan = planMaterialOutline("course-kalkulus", "Turunan Fungsi", kos);
    expect(plan.preflightPassed).toBe(true);
    expect(plan.sections.length).toBe(1);

    const section = plan.sections[0];
    expect(section.includedKoIds).toEqual(["ko-101"]);
    expect(section.excludedKos.length).toBe(1);
    expect(section.excludedKos[0].koId).toBe("ko-102");
    expect(section.excludedKos[0].reason).toBe("duplicate");
  });

  it("AI-MAT-COMP-003: Serializes AST blocks to canonical Markdown deterministically", () => {
    const blocks: ASTBlock[] = [
      { id: "b1", type: "h", level: 1, globalOrderIndex: 0, content: "Judul Materi" },
      { id: "b2", type: "p", globalOrderIndex: 1, content: "Ini adalah paragraf penjelas." },
    ];

    const markdown1 = serializeBlocksToMarkdown(blocks);
    const markdown2 = serializeBlocksToMarkdown(blocks);

    expect(markdown1).toBe("# Judul Materi\n\nIni adalah paragraf penjelas.");
    expect(markdown1).toBe(markdown2);
  });

  it("AI-MAT-DIFF-001: Computes revision diff between two versions of compiled material ASTs", () => {
    const v1Blocks: ASTBlock[] = [
      { id: "b1", type: "h", level: 1, globalOrderIndex: 0, content: "Judul V1" },
      { id: "b2", type: "p", globalOrderIndex: 1, content: "Konten V1" },
    ];

    const v2Blocks: ASTBlock[] = [
      { id: "b1", type: "h", level: 1, globalOrderIndex: 0, content: "Judul V1" },
      { id: "b3", type: "p", globalOrderIndex: 2, content: "Konten Baru V2" },
    ];

    const diff = computeMaterialRevisionDiff(v1Blocks, v2Blocks);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.addedBlocks.map((b) => b.id)).toEqual(["b3"]);
    expect(diff.removedBlocks.map((b) => b.id)).toEqual(["b2"]);
  });

  it("AI-MAT-COMP-004: Orders prerequisite KOs and rejects cycles", () => {
    const ordered = planMaterialOutline("course", "Topic", [
      { id: "ko-2", title: "Second", type: "definition", content: "second", difficulty: "easy", prerequisiteKoIds: ["ko-1"] },
      { id: "ko-1", title: "First", type: "definition", content: "first", difficulty: "easy" },
    ]);
    expect(ordered.sections[0].includedKoIds).toEqual(["ko-1", "ko-2"]);
    const cycle = planMaterialOutline("course", "Topic", [
      { id: "ko-a", title: "A", type: "definition", content: "a", difficulty: "easy", prerequisiteKoIds: ["ko-b"] },
      { id: "ko-b", title: "B", type: "definition", content: "b", difficulty: "easy", prerequisiteKoIds: ["ko-a"] },
    ]);
    expect(cycle.preflightPassed).toBe(false);
    expect(cycle.validationErrors[0]).toContain("KO_PREREQUISITE_CYCLE");
  });

  it("AI-MAT-COMP-005: Compiles a Product Bundle article deterministically", () => {
    const hash = "c".repeat(64);
    const product = {
      id: "article-1",
      productType: "article" as const,
      courseId: "course-1",
      chapterId: "chapter-1",
      version: 1,
      status: "published" as const,
      ideaLinks: [{ id: "idea-1", version: 1, semanticHash: hash, weight: 1, role: "primary" as const }],
      sourceRefs: [{ sourceId: "source-1", version: 1, checksum: hash, excerptIds: ["excerpt-1"] }],
      schemaVersion: "article.v1",
      sourceHash: hash,
      generationHash: hash,
      creatorId: "user-1",
      slug: "article-1",
      title: "Article",
      blocks: [
        { id: "b1", blockType: "prior_knowledge_activation", orderIndex: 0, content: "Prior" },
        { id: "b2", blockType: "problem_introduction", orderIndex: 1, content: "Problem" },
        { id: "b3", blockType: "explanation", orderIndex: 2, content: "Explanation" },
        { id: "b4", blockType: "verbal_representation", orderIndex: 3, content: "Verbal" },
        { id: "b5", blockType: "mathematical_representation", orderIndex: 4, content: "Not applicable", },
        { id: "b6", blockType: "analogy", orderIndex: 5, content: "Analogy" },
        { id: "b7", blockType: "worked_example", orderIndex: 6, content: "Example" },
        { id: "b8", blockType: "misconception", orderIndex: 7, content: "Misconception" },
        { id: "b9", blockType: "application", orderIndex: 8, content: "Application" },
        { id: "b10", blockType: "retrieval_prompt", orderIndex: 9, content: "Recall" },
        { id: "b11", blockType: "summary", orderIndex: 10, content: "Summary" },
        { id: "b12", blockType: "retrieval_close", orderIndex: 11, content: "Close" },
      ],
    };
    const first = compileArticleProduct(product, { strict: false });
    const second = compileArticleProduct(product, { strict: false });
    expect(first.markdown).toBe(second.markdown);
    expect(first.ast.blocks.length).toBe(13);
  });
});
