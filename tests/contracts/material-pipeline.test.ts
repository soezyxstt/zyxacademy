import { describe, expect, it } from "bun:test";
import {
  planMaterialOutline,
  validatePreflightKos,
  serializeBlocksToMarkdown,
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
});
