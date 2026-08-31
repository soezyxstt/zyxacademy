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
  return { id: "article-1", courseId: "course-1", title: "Article", version: 1, generationHash: checksum, ideaIds: ["idea-1"], blocks, sections: [], reviewerState: "approved" };
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

function validV3Article(): ArticleDocument {
  const overviewBlocks: ArticleBlock[] = [
    block("b-ov-1", "prior_knowledge_activation", ["idea-1"]),
    block("b-ov-2", "problem_introduction", ["idea-1"]),
  ];
  const topicBlocks: ArticleBlock[] = [
    block("b-top-1", "explanation", ["idea-1"]),
    block("b-top-2", "retrieval_prompt", ["idea-1"]),
  ];
  const summaryBlocks: ArticleBlock[] = [
    block("b-sum-1", "summary", ["idea-1"]),
    block("b-sum-2", "retrieval_close", ["idea-1"]),
  ];
  const sections = [
    {
      id: "sec-overview",
      kind: "overview" as const,
      title: "Overview Section",
      slug: "overview-section",
      orderIndex: 0,
      learningObjective: "Tujuan pembelajaran overview",
      ideaIds: ["idea-1"],
      sourceRefs,
      blocks: overviewBlocks,
    },
    {
      id: "sec-topic",
      kind: "topic" as const,
      learningSectionId: "ls-1",
      title: "Topic Section",
      slug: "topic-section",
      orderIndex: 1,
      learningObjective: "Tujuan pembelajaran topik",
      ideaIds: ["idea-1"],
      sourceRefs,
      blocks: topicBlocks,
    },
    {
      id: "sec-summary",
      kind: "summary" as const,
      title: "Summary Section",
      slug: "summary-section",
      orderIndex: 2,
      learningObjective: "Tujuan pembelajaran rangkuman",
      ideaIds: ["idea-1"],
      sourceRefs,
      blocks: summaryBlocks,
    },
  ];
  return {
    id: "article-v3-1",
    courseId: "course-1",
    title: "Article V3",
    version: 1,
    generationHash: checksum,
    ideaIds: ["idea-1"],
    blocks: [...overviewBlocks, ...topicBlocks, ...summaryBlocks],
    sections,
    reviewerState: "approved",
  };
}

describe("Article V3 quality contract", () => {
  it("passes valid V3 article with overview, topic, summary, and final check", () => {
    const result = evaluateArticleQuality(validV3Article());
    expect(result.passed).toBe(true);
    expect(result.metrics.requiredCoveragePercent).toBe(100);
    expect(result.metrics.shortTopicWarning).toBeDefined();
  });

  it("rejects missing overview or summary section in V3", () => {
    const noOverview = validV3Article();
    noOverview.sections = noOverview.sections.filter((s) => s.kind !== "overview");
    const resOverview = evaluateArticleQuality(noOverview);
    expect(resOverview.passed).toBe(false);
    expect(resOverview.issues.map((i) => i.code)).toContain("ARTICLE_MISSING_OVERVIEW");

    const noSummary = validV3Article();
    noSummary.sections = noSummary.sections.filter((s) => s.kind !== "summary");
    const resSummary = evaluateArticleQuality(noSummary);
    expect(resSummary.passed).toBe(false);
    expect(resSummary.issues.map((i) => i.code)).toContain("ARTICLE_MISSING_SUMMARY");
  });

  it("rejects missing chapter final check in V3", () => {
    const article = validV3Article();
    for (const section of article.sections) {
      section.blocks = section.blocks.filter((b) => b.blockType !== "retrieval_close");
    }
    const result = evaluateArticleQuality(article);
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("ARTICLE_MISSING_CHAPTER_FINAL_CHECK");
  });

  it("rejects topic section missing explanation or retrieval", () => {
    const noExp = validV3Article();
    const topic = noExp.sections.find((s) => s.kind === "topic")!;
    topic.blocks = topic.blocks.filter((b) => b.blockType !== "explanation");
    const resExp = evaluateArticleQuality(noExp);
    expect(resExp.passed).toBe(false);
    expect(resExp.issues.map((i) => i.code)).toContain("ARTICLE_TOPIC_MISSING_EXPLANATION");

    const noRet = validV3Article();
    const topic2 = noRet.sections.find((s) => s.kind === "topic")!;
    topic2.blocks = topic2.blocks.filter((b) => b.blockType !== "retrieval_prompt" && b.blockType !== "retrieval_close");
    const resRet = evaluateArticleQuality(noRet);
    expect(resRet.passed).toBe(false);
    expect(resRet.issues.map((i) => i.code)).toContain("ARTICLE_TOPIC_MISSING_RETRIEVAL");
  });

  it("rejects topic exceeding 1500 words and reports short topic warning in metrics", () => {
    const longArticle = validV3Article();
    const topic = longArticle.sections.find((s) => s.kind === "topic")!;
    topic.blocks[0].content = "word ".repeat(1501);
    const result = evaluateArticleQuality(longArticle);
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("ARTICLE_TOPIC_WORD_COUNT_EXCEEDED");
  });

  it("rejects untraced factual block and uncovered Idea in V3", () => {
    const untraced = validV3Article();
    const topic = untraced.sections.find((s) => s.kind === "topic")!;
    topic.blocks[0].sourceRefs = [];
    const resUntraced = evaluateArticleQuality(untraced);
    expect(resUntraced.passed).toBe(false);
    expect(resUntraced.issues.map((i) => i.code)).toContain("ARTICLE_SOURCE_TRACE_MISSING");

    const uncovered = validV3Article();
    uncovered.ideaIds = ["idea-1", "idea-2"];
    const resUncovered = evaluateArticleQuality(uncovered);
    expect(resUncovered.passed).toBe(false);
    expect(resUncovered.issues.map((i) => i.code)).toContain("ARTICLE_MISSING_IDEA_COVERAGE");
  });
});
