import "server-only";

import { cache } from "react";
import { sanitizeSnapshot } from "@/app/(marketing)/demo/demo-data";
import type { DemoSummary } from "@/components/demo/demo-shell";
import { sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import { getPublicDemoContexts, getPublicDemoInitialArticles } from "@/lib/demo/context-repository";
import { fictionalDemoProducts } from "@/lib/demo/fictional-products";

/** Metadata for the shell only. Product and grading access use the scoped resolver. */
export const getDemoSummaries = cache(async (): Promise<DemoSummary[]> => {
  try {
    const contexts = await getPublicDemoContexts();
    const initialArticles = await getPublicDemoInitialArticles(contexts.values());
    return [...contexts.values()].flatMap((context): DemoSummary[] => {
      if (!context) return [];
      try {
        const { row, first, metadata } = context;
        const snapshot = sanitizeSnapshot(row.snapshot);
        const course = { id: row.course.id, title: row.course.title, ...metadata, chapterTitle: first.title, chapterNumber: first.orderIndex };
        if (sanitizeDemoMarkdown(course.id) !== course.id) return [];
        const article = initialArticles.get(row.course.id) ?? fictionalDemoProducts(row.course, first)?.article;
        if (article && sanitizeDemoMarkdown(article.id) !== article.id) return [];
        return [{ snapshot, content: { course: {
          ...course,
          title: sanitizeDemoMarkdown(course.title),
          category: sanitizeDemoMarkdown(course.category),
          description: course.description === null ? null : sanitizeDemoMarkdown(course.description),
          chapterTitle: sanitizeDemoMarkdown(course.chapterTitle),
        }, ...(article ? { article: { id: article.id, title: sanitizeDemoMarkdown(article.title) } } : {}) } }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
});
