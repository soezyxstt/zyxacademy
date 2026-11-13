import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { createThermalArticle } from "./thermal-article-data";

// Reproduce the parsed persisted rows passed by structured-repository to the real projection.
export function buildThermalArticleReadModel(spec: InteractiveDocumentSpec) {
  const article = createThermalArticle(spec);
  const sections = article.sections.map(section => ({
    ...section, artikelId: article.id, sectionKind: section.kind, status: "published",
  }));
  const blocks = article.sections.flatMap(section => section.blocks.map(block => ({
    ...block, bagianArtikelId: section.id, blockKey: block.id,
    content: block.contentMarkdown, status: "published",
  })));
  return buildPublicArticleReadModel(
    { ...article, babId: article.chapterId ?? null, status: "published" }, sections, blocks, [],
    { id: article.chapterId ?? null, title: "Perpindahan panas", number: 1, courseTitle: "Perpindahan panas" },
  );
}
