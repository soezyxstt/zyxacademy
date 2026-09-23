import type { ProductEntity } from "@/lib/bundle/product-validator";
import { finishQualityReport, qualityIssue, type AuthoringQualityReport } from "./types";

type ArticleQualityMetrics = {
  wordCount: number;
  ideaCount: number;
  effectiveWords: Record<string, number>;
  implicitMultiIdeaBlocks: number;
  workedExamples: number;
  misconceptions: number;
  analogies: number;
  retrievalPrompts: number;
  visuals: number;
  formulas: number;
  sections: Array<{ id: string; kind: "overview" | "topic" | "summary"; wordCount: number; estimatedReadingMinutes: number; explanationBlocks: number; retrievalBlocks: number }>;
};

type DiktatQualityMetrics = {
  wordCount: number;
  headings: number;
  examples: number;
  traps: number;
  retrievals: number;
  visuals: number;
  formulas: number;
};

export type ProductBundleQualityReport = AuthoringQualityReport<{
  articleCount: number;
  diktatCount: number;
  articles: Array<ArticleQualityMetrics & { id: string }>;
  diktats: Array<DiktatQualityMetrics & { id: string; sourceArticleId: string; compressionRatio: number; estimatedReadingMinutes: number }>;
}>;

function words(value: string): number {
  return String(value).replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ").match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function countMatches(value: string, pattern: RegExp): number {
  return [...String(value).matchAll(pattern)].length;
}

function blockContent(block: Extract<ProductEntity, { productType: "article" }>['blocks'][number]): { text: string; ideaIds: string[] } {
  try {
    const parsed: unknown = JSON.parse(block.content);
    if (parsed && typeof parsed === "object" && "content" in parsed && typeof parsed.content === "string") {
      const value = parsed as { content: string; ideaIds?: unknown };
      return { text: value.content, ideaIds: Array.isArray(value.ideaIds) ? value.ideaIds.filter((id): id is string => typeof id === "string") : [] };
    }
  } catch {
    // Plain Markdown remains valid for a single-Idea Article.
  }
  return { text: block.content, ideaIds: [] };
}

function visualCount(value: string): number {
  const patterns = [
    /!\[[^\]]*\]\([^)]*\)/g,
    /```(?:mermaid|text|ascii)[\s\S]*?```/gi,
    /<svg\b[\s\S]*?<\/svg>/gi,
    /(?:^|\n)\s*\|[^\n]+\|\s*\n\s*\|\s*:?-{3,}/g,
    /(?:^|\n)\s*(?:garis bilangan|tabel tanda|diagram|flowchart|sketsa grafik)\s*:/gi,
  ];
  return patterns.reduce((total, pattern) => total + countMatches(value, pattern), 0);
}

function formulaCount(value: string): number {
  return countMatches(value, /\$\$[\s\S]+?\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$/g);
}

function articleMetrics(article: Extract<ProductEntity, { productType: "article" }>): ArticleQualityMetrics {
  const ideaIds = article.ideaLinks.map((link) => link.id);
  const credit = new Map(ideaIds.map((id) => [id, 0]));
  const articleSections = article.sections ?? [];
  const articleBlocks = article.blocks ?? [];
  const sectionMetrics = articleSections.map((section) => {
    const text = section.blocks.map((block) => block.contentMarkdown).join("\n");
    return {
      id: section.id,
      kind: section.kind,
      wordCount: words(text),
      estimatedReadingMinutes: Math.max(1, Math.ceil(words(text) / 200)),
      explanationBlocks: section.blocks.filter((block) => block.blockType === "explanation").length,
      retrievalBlocks: section.blocks.filter((block) => block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close").length,
    };
  });
  const parsedBlocks = articleSections.length > 0
    ? articleSections.flatMap((section) => section.blocks.map((block) => ({ block: { ...block, content: block.contentMarkdown }, text: block.contentMarkdown, ideaIds: block.ideaIds })))
    : articleBlocks.map((block) => ({ block, ...blockContent(block) }));
  let implicitMultiIdeaBlocks = 0;
  for (const block of parsedBlocks) {
    let blockIdeaIds = block.ideaIds.filter((id) => credit.has(id));
    if (blockIdeaIds.length === 0 && ideaIds.length === 1) blockIdeaIds = ideaIds;
    if (blockIdeaIds.length === 0 && ideaIds.length > 1) implicitMultiIdeaBlocks += 1;
    const perIdeaWords = blockIdeaIds.length > 0 ? words(block.text) / blockIdeaIds.length : 0;
    for (const ideaId of blockIdeaIds) credit.set(ideaId, (credit.get(ideaId) ?? 0) + perIdeaWords);
  }
  const text = parsedBlocks.map((block) => block.text).join("\n");
  return {
    wordCount: words(text),
    ideaCount: ideaIds.length,
    effectiveWords: Object.fromEntries([...credit].map(([id, count]) => [id, Math.round(count)])),
    implicitMultiIdeaBlocks,
    workedExamples: parsedBlocks.filter((block) => block.block.blockType === "worked_example").length,
    misconceptions: parsedBlocks.filter((block) => block.block.blockType === "misconception").length,
    analogies: parsedBlocks.filter((block) => block.block.blockType === "analogy").length,
    retrievalPrompts: parsedBlocks.filter((block) => block.block.blockType === "retrieval_prompt").length,
    visuals: visualCount(text),
    formulas: formulaCount(text),
    sections: sectionMetrics,
  };
}

function diktatMetrics(diktat: Extract<ProductEntity, { productType: "diktat" }>): DiktatQualityMetrics {
  const text = diktat.contentMarkdown;
  return {
    wordCount: words(text),
    headings: countMatches(text, /^#{1,4}\s+\S.+$/gm),
    examples: countMatches(text, /^#{1,4}\s+.*(?:contoh|example)|\bcontoh\s+(?:kilat|singkat|soal)\b/gim),
    traps: countMatches(text, /\b(?:jebakan|miskonsepsi|kesalahan umum|hati-hati|peringatan)\b/gi),
    retrievals: countMatches(text, /\b(?:cek ingatan|uji pemahaman|retrieval|coba jawab)\b/gi),
    visuals: visualCount(text),
    formulas: formulaCount(text),
  };
}

export function evaluateProductBundleQuality(data: { products: readonly ProductEntity[] }): ProductBundleQualityReport {
  const issues = [];
  const articles = data.products.filter((product): product is Extract<ProductEntity, { productType: "article" }> => product.productType === "article");
  const diktats = data.products.filter((product): product is Extract<ProductEntity, { productType: "diktat" }> => product.productType === "diktat");
  const articleReports: Array<ArticleQualityMetrics & { id: string }> = [];
  const diktatReports: Array<DiktatQualityMetrics & { id: string; sourceArticleId: string; compressionRatio: number; estimatedReadingMinutes: number }> = [];

  for (const article of articles) {
    const metrics = articleMetrics(article);
    if ((article.sections?.length ?? 0) > 0) {
      for (const section of article.sections ?? []) {
        for (const block of section.blocks) {
          const payload = block.formativeCheckPayload;
          if (
            payload
            && ["short_answer", "conceptual_explanation", "numeric_answer"].includes(payload.checkKind)
            && !payload.evaluation
          ) {
            issues.push(qualityIssue(
              "ARTICLE_FORMATIVE_CHECK_REVEAL_ONLY",
              `Cek formatif ${block.id} hanya dapat membuka pembahasan karena belum memiliki evaluation.`,
              "warning",
              { entity: `${article.id}:${section.id}:${block.id}`, expected: "evaluation", observed: "missing" },
            ));
          }
        }
      }
      const topicMetrics = metrics.sections.filter((section) => section.kind === "topic");
      for (const section of topicMetrics) {
        if (section.wordCount > 1500) issues.push(qualityIssue("ARTICLE_TOPIC_TOO_LONG", `Bagian ${section.id} melebihi hard limit 1.500 kata.`, "blocking", { entity: `${article.id}:${section.id}`, expected: 1500, observed: section.wordCount }));
        if (section.wordCount < 450) issues.push(qualityIssue("ARTICLE_TOPIC_SHORT", `Bagian ${section.id} lebih pendek dari target bacaan 3 menit.`, "warning", { entity: `${article.id}:${section.id}`, expected: 450, observed: section.wordCount }));
        if (section.explanationBlocks === 0) issues.push(qualityIssue("ARTICLE_TOPIC_EXPLANATION_MISSING", `Bagian ${section.id} belum memiliki penjelasan inti.`, "blocking", { entity: `${article.id}:${section.id}`, expected: 1, observed: 0 }));
        if (section.retrievalBlocks === 0) issues.push(qualityIssue("ARTICLE_TOPIC_CHECK_MISSING", `Bagian ${section.id} belum memiliki pemeriksaan pemahaman.`, "blocking", { entity: `${article.id}:${section.id}`, expected: 1, observed: 0 }));
      }
      articleReports.push({ id: article.id, ...metrics });
      continue;
    }
    const minimumWords = Math.max(1800, metrics.ideaCount * 280);
    if (metrics.wordCount < minimumWords) issues.push(qualityIssue("ARTICLE_TOO_SHALLOW", `Article ${article.id} does not contain enough learner-facing content.`, "blocking", { entity: article.id, expected: minimumWords, observed: metrics.wordCount }));
    if (metrics.implicitMultiIdeaBlocks > 0) issues.push(qualityIssue("ARTICLE_IDEA_ATTRIBUTION_TOO_BROAD", `Article ${article.id} has blocks without explicit Idea attribution.`, "blocking", { entity: article.id, expected: 0, observed: metrics.implicitMultiIdeaBlocks }));
    for (const [ideaId, effectiveWords] of Object.entries(metrics.effectiveWords)) {
      if (effectiveWords < 220) issues.push(qualityIssue("ARTICLE_IDEA_DEPTH_INSUFFICIENT", `Article ${article.id} does not explain Idea ${ideaId} deeply enough.`, "blocking", { entity: `${article.id}:${ideaId}`, expected: 220, observed: effectiveWords }));
    }
    const thresholds = {
      workedExamples: Math.ceil(metrics.ideaCount / 6),
      analogies: Math.ceil(metrics.ideaCount / 8),
      visuals: Math.ceil(metrics.ideaCount / 8),
      retrievalPrompts: Math.ceil(metrics.ideaCount / 6),
    };
    for (const [metric, minimum] of Object.entries(thresholds)) {
      const observed = metrics[metric as keyof typeof thresholds];
      if (observed < minimum) issues.push(qualityIssue(`ARTICLE_${metric.replace(/[A-Z]/g, (value) => `_${value}`).toUpperCase()}_LOW`, `Article ${article.id} does not meet the ${metric} density gate.`, "blocking", { entity: article.id, expected: minimum, observed }));
    }
    articleReports.push({ id: article.id, ...metrics });
  }

  const articleById = new Map(articles.map((article) => [article.id, article]));
  const articleMetricsById = new Map(articleReports.map((report) => [report.id, report]));
  for (const diktat of diktats) {
    const metrics = diktatMetrics(diktat);
    const article = articleById.get(diktat.sourceArticleId);
    const articleReport = articleMetricsById.get(diktat.sourceArticleId);
    if (!article || !articleReport) {
      issues.push(qualityIssue("DIKTAT_ARTICLE_QUALITY_BASELINE_MISSING", `Diktat ${diktat.id} does not reference a quality-audited Article.`, "blocking", { entity: diktat.id, expected: "quality-audited Article", observed: diktat.sourceArticleId }));
      continue;
    }
    const articleIdeaIds = new Set(article.ideaLinks.map((link) => link.id));
    const diktatIdeaIds = new Set(diktat.ideaLinks.map((link) => link.id));
    const missingIdeas = [...articleIdeaIds].filter((id) => !diktatIdeaIds.has(id));
    if (missingIdeas.length > 0 || diktatIdeaIds.size !== articleIdeaIds.size) issues.push(qualityIssue("DIKTAT_IDEA_COVERAGE_INCOMPLETE", `Diktat ${diktat.id} does not cover the exact Article Idea set.`, "blocking", { entity: diktat.id, expected: [...articleIdeaIds], observed: [...diktatIdeaIds] }));
    // The compression gate is a hard ceiling, so a sectioned Article must not
    // require a Diktat longer than that ceiling merely because it is short.
    const ratioCompatibleMinimum = Math.max(1, Math.floor(articleReport.wordCount * 0.45));
    const minimumWords = Math.min(
      Math.max(900, Math.min(1500, Math.ceil(articleReport.wordCount * 0.12))),
      ratioCompatibleMinimum,
    );
    const ratio = articleReport.wordCount > 0 ? metrics.wordCount / articleReport.wordCount : 0;
    if (metrics.wordCount < minimumWords) issues.push(qualityIssue("DIKTAT_TOO_THIN", `Diktat ${diktat.id} is too short for its source Article.`, "blocking", { entity: diktat.id, expected: minimumWords, observed: metrics.wordCount }));
    if (ratio > 0.45) issues.push(qualityIssue("DIKTAT_COMPRESSION_RATIO_HIGH", `Diktat ${diktat.id} uses more than 45% of the Article word count; review for yapping and repeated prose.`, ratio > 0.6 ? "blocking" : "warning", { entity: diktat.id, expected: 0.45, observed: Number(ratio.toFixed(3)) }));
    if (metrics.wordCount > 2200) issues.push(qualityIssue("DIKTAT_WORD_BUDGET_EXCEEDED", `Diktat ${diktat.id} exceeds the early warning budget of 2,200 words before A4 rendering.`, "blocking", { entity: diktat.id, expected: 2200, observed: metrics.wordCount }));
    const thresholds = {
      headings: Math.max(1, Math.min(8, article.sections?.filter((section) => section.kind === "topic").length || 1)),
      examples: Math.min(articleReport.workedExamples, 2),
      visuals: Math.min(articleReport.visuals, 2),
      traps: Math.min(articleReport.misconceptions, 2),
      retrievals: articleReport.retrievalPrompts > 0 ? 1 : 0,
      formulas: Math.min(articleReport.formulas, 8),
    };
    for (const [metric, minimum] of Object.entries(thresholds)) {
      const observed = metrics[metric as keyof typeof thresholds];
      if (observed < minimum) issues.push(qualityIssue(`DIKTAT_${metric.toUpperCase()}_COVERAGE_LOW`, `Diktat ${diktat.id} does not meet the ${metric} coverage gate.`, "blocking", { entity: diktat.id, expected: minimum, observed }));
    }
    diktatReports.push({ id: diktat.id, sourceArticleId: diktat.sourceArticleId, compressionRatio: Number(ratio.toFixed(3)), estimatedReadingMinutes: Math.ceil(metrics.wordCount / 200), ...metrics });
  }

  return finishQualityReport(issues, { articleCount: articles.length, diktatCount: diktats.length, articles: articleReports, diktats: diktatReports });
}
