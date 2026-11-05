import "server-only";

import { sanitizeSnapshot } from "@/app/(marketing)/demo/demo-data";
import type { DemoSummary } from "@/components/demo/demo-shell";
import { sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import { getPublicDemoSnapshots } from "@/lib/demo/snapshot-repository";
import { buildCourseSummary, resolveCanonicalCourse, resolveDemoFirstChapter, resolveDemoInitialArticles } from "@/lib/demo/legacy-eligibility";
import { fictionalDemoProducts } from "@/lib/demo/fictional-products";

/** Metadata for the shell only. Product and grading access use the full resolver. */
export async function getDemoSummaries(): Promise<DemoSummary[]> {
  const rows = await getPublicDemoSnapshots();
  const summaries = await Promise.all(rows.map(async (row): Promise<DemoSummary | null> => {
    try {
      const snapshot = sanitizeSnapshot(row.snapshot);
      const course = await resolveCanonicalCourse(snapshot.courseId);
      if (!course || course.id !== snapshot.courseId) return null;
      const first = await resolveDemoFirstChapter(course);
      if (!first) return null;
      const [metadata, articles] = await Promise.all([buildCourseSummary(course, first), resolveDemoInitialArticles(course, first)]);
      if (sanitizeDemoMarkdown(metadata.id) !== metadata.id) return null;
      const article = articles[0] ?? fictionalDemoProducts(course, first)?.article;
      if (article && sanitizeDemoMarkdown(article.id) !== article.id) return null;
      return { snapshot, content: { course: {
        ...metadata,
        title: sanitizeDemoMarkdown(metadata.title),
        category: sanitizeDemoMarkdown(metadata.category),
        description: metadata.description === null ? null : sanitizeDemoMarkdown(metadata.description),
        chapterTitle: sanitizeDemoMarkdown(metadata.chapterTitle),
      }, ...(article ? { article: { id: article.id, title: sanitizeDemoMarkdown(article.title) } } : {}) } };
    } catch {
      return null;
    }
  }));
  return summaries.filter((item): item is DemoSummary => item !== null);
}
