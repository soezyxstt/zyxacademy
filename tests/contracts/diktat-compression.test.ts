import { describe, expect, it } from "bun:test";
import { compileDiktatFromArticle, verifyDiktatCompression } from "@/lib/materials/diktat-contract";
import { evaluateDiktatQuality } from "@/lib/materials/quality-gates";
import type { ArticleBlock, ArticleDocument } from "@/lib/materials/article-contract";

const checksum = "b".repeat(64);
const sourceRefs = [{ sourceId: "source-1", version: 1, checksum, excerptIds: ["excerpt-1"] }];

function makeArticle(): ArticleDocument {
  const types: ArticleBlock["blockType"][] = [
    "prior_knowledge_activation", "problem_introduction", "explanation", "verbal_representation",
    "mathematical_representation", "analogy", "worked_example", "misconception", "application",
    "retrieval_prompt", "summary", "retrieval_close",
  ];
  const blocks = types.map((blockType, index): ArticleBlock => ({
    id: `block-${index}`,
    blockType,
    orderIndex: index,
    content: blockType === "mathematical_representation" ? "Rumus $$v = s/t$$ dengan s sebagai jarak dan t sebagai waktu." : `${blockType} for idea-1`,
    ideaIds: ["idea-1"],
    sourceRefs: ["prior_knowledge_activation", "problem_introduction", "retrieval_close"].includes(blockType) ? [] : sourceRefs,
    learningPurpose: blockType,
    generationHash: checksum,
    reviewerState: "approved",
    applicability: { status: "applicable" },
  }));
  return { id: "article-1", courseId: "course-1", title: "Article", version: 3, generationHash: checksum, ideaIds: ["idea-1"], blocks, reviewerState: "approved" };
}

describe("Diktat compression contract", () => {
  it("compresses only the approved article and preserves formulas and traces", () => {
    const article = makeArticle();
    const first = compileDiktatFromArticle(article);
    const second = compileDiktatFromArticle(article);
    expect(first.document).toEqual(second.document);
    expect(first.report.preservedFormulaBlockIds).toEqual(["block-4"]);
    expect(evaluateDiktatQuality(article, first.document).passed).toBe(true);
  });

  it("rejects a removed formula or changed source trace", () => {
    const article = makeArticle();
    const compiled = compileDiktatFromArticle(article);
    compiled.document.blocks = compiled.document.blocks.filter((block) => block.sourceArticleBlockId !== "block-4");
    const report = verifyDiktatCompression(article, compiled.document);
    expect(report.lossFree).toBe(false);
    expect(report.reasonCodes).toContain("DIKTAT_FORMULA_LOST");
  });
});
