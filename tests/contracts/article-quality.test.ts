import { describe, expect, it } from "bun:test";
import { evaluateArticleQuality } from "@/lib/materials/quality-gates";
import type { ArticleBlock, ArticleDocument } from "@/lib/materials/article-contract";

const checksum = "a".repeat(64);
const sourceRefs = [{ sourceId: "source-1", version: 1, checksum, excerptIds: ["excerpt-1"] }];

function block(id: string, blockType: ArticleBlock["blockType"], ideaIds: string[] = ["idea-1"], content = `${blockType} content`): ArticleBlock {
  return {
    id,
    blockType,
    orderIndex: Number(id.replace(/\D/g, "")) || 0,
    content,
    ideaIds,
    sourceRefs: ["prior_knowledge_activation", "problem_introduction", "retrieval_close"].includes(blockType) ? [] : sourceRefs,
    learningPurpose: `purpose ${blockType}`,
    generationHash: checksum,
    reviewerState: "approved",
    applicability: { status: "applicable" },
  };
}

function validArticle(): ArticleDocument {
  const blocks: ArticleBlock[] = [
    block("b1", "prior_knowledge_activation", []),
    block("b2", "problem_introduction", []),
    block("b3", "explanation"),
    block("b4", "verbal_representation"),
    { ...block("b5", "mathematical_representation"), content: "Tidak berlaku untuk Idea ini", applicability: { status: "inapplicable", reason: "not_mathematical" } },
    block("b6", "analogy"),
    block("b7", "worked_example"),
    block("b8", "misconception"),
    block("b9", "application"),
    block("b10", "retrieval_prompt"),
    block("b11", "summary"),
    block("b12", "retrieval_close", []),
  ];
  return { id: "article-1", courseId: "course-1", title: "Article", version: 1, generationHash: checksum, ideaIds: ["idea-1"], blocks, reviewerState: "approved" };
}

describe("Article quality contract", () => {
  it("passes all required blocks and typed inapplicability", () => {
    const result = evaluateArticleQuality(validArticle());
    expect(result.passed).toBe(true);
    expect(result.metrics.requiredCoveragePercent).toBe(100);
  });

  it("rejects a missing required block with a stable reason code", () => {
    const article = validArticle();
    article.blocks = article.blocks.filter((entry) => entry.blockType !== "application");
    const result = evaluateArticleQuality(article);
    expect(result.passed).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("ARTICLE_MISSING_IDEA_BLOCK");
  });

  it("rejects bad math and stale dependencies", () => {
    const article = validArticle();
    article.blocks = article.blocks.map((entry) => entry.blockType === "explanation" ? { ...entry, content: "Broken $$x" } : entry);
    const result = evaluateArticleQuality(article, { dependencies: [{ id: "idea-1", freshness: "STALE" }] });
    expect(result.issues.map((entry) => entry.code)).toContain("ARTICLE_INVALID_MATH");
    expect(result.issues.map((entry) => entry.code)).toContain("ARTICLE_STALE_DEPENDENCY");
  });
});
