import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleReadingCanvas } from "@/components/course/article-reading-canvas";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-reader";
import { ArticleParts } from "@/components/course/article-parts";
import type { PublicSectionReadModel } from "@/lib/articles/structured-read-model";

test("learner headings and breadcrumbs typeset authored math without changing heading semantics", async () => {
  process.env.BETTER_AUTH_SECRET ||= "local-scientific-heading-test-secret-32";
  process.env.SKIP_ENV_VALIDATION ||= "1";
  process.env.DATABASE_URL ||= "file::memory:";
  const { StructuredArticleSectionContent } = await import("@/components/course/structured-article-reader");
  const section: PublicSectionReadModel = { id: "section", slug: "section", title: "Lingkungan $\\delta$", sectionNumber: "2.1", sectionKind: "topic", orderIndex: 0, learningObjective: "Toleransi $\\varepsilon>0$.", estimatedReadingMinutes: 1, parentSectionId: null, blocks: [] };
  const reader = renderToStaticMarkup(<StructuredArticleSectionContent section={section} articleId="article" articleVersion={4} showProgress={false} />);
  expect(reader).toMatch(/<h2[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h2>/);
  expect(reader).not.toContain("katex-error");
  const canvas = renderToStaticMarkup(<ArticleReadingCanvas content="Isi." chapterTitle="Limit $L$" sectionTitle="Lingkungan $\\delta$" breadcrumbItems={["Toleransi $\\varepsilon$"]} />);
  expect(canvas).toMatch(/<h1[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h1>/);
  expect(canvas).toMatch(/<h2[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h2>/);
  expect(canvas.match(/class="katex"/g)?.length).toBe(3);
  expect(canvas).not.toContain("katex-error");
  const example = renderToStaticMarkup(<ArticleParts parts={[{ id: "example", kind: "worked_example", title: "Pilih $\\delta$", problemMarkdown: "Pertanyaan.", verificationMarkdown: "Selesai.", steps: [{ id: "step", operationMarkdown: "Langkah.", reasonMarkdown: "Alasan.", sourceElementRefs: ["example"], parts: [{ id: "text", kind: "markdown", markdown: "Isi." }] }] }]} />);
  expect(example).toMatch(/<h4[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h4>/);
});
