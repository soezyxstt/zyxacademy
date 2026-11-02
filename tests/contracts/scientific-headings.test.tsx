import { expect, mock, test } from "bun:test";
import { renderWithMessages } from "../helpers/render-with-messages";
import type { PublicSectionReadModel } from "@/lib/articles/structured-read-model";

mock.module("server-only", () => ({}));

test("learner headings and breadcrumbs typeset authored math without changing heading semantics", async () => {
  process.env.BETTER_AUTH_SECRET ||= "local-scientific-heading-test-secret-32";
  process.env.SKIP_ENV_VALIDATION ||= "1";
  process.env.DATABASE_URL ||= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
  const { StructuredArticleSectionContent } = await import("@/components/course/structured-article-reader");
  const { ArticleReadingCanvas } = await import("@/components/course/article-reading-canvas");
  const { ArticleParts } = await import("@/components/course/article-parts");
  const section: PublicSectionReadModel = { id: "section", slug: "section", title: "Lingkungan $\\delta$", sectionNumber: "2.1", sectionKind: "topic", orderIndex: 0, learningObjective: "Toleransi $\\varepsilon>0$.", estimatedReadingMinutes: 1, parentSectionId: null, blocks: [] };
  const reader = renderWithMessages(<StructuredArticleSectionContent section={section} articleId="article" articleVersion={4} showProgress={false} />);
  expect(reader).toMatch(/<h2[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h2>/);
  expect(reader).not.toContain("katex-error");
  const canvas = renderWithMessages(<ArticleReadingCanvas content="Isi." chapterTitle="Limit $L$" sectionTitle="Lingkungan $\\delta$" breadcrumbItems={["Toleransi $\\varepsilon$"]} />);
  expect(canvas).toMatch(/<h1[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h1>/);
  expect(canvas).toMatch(/<h2[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h2>/);
  expect(canvas.match(/class="katex"/g)?.length).toBe(3);
  expect(canvas).not.toContain("katex-error");
  const example = renderWithMessages(<ArticleParts parts={[{ id: "example", kind: "worked_example", title: "Pilih $\\delta$", problemMarkdown: "Pertanyaan.", verificationMarkdown: "Selesai.", steps: [{ id: "step", operationMarkdown: "Langkah.", reasonMarkdown: "Alasan.", sourceElementRefs: ["example"], parts: [{ id: "text", kind: "markdown", markdown: "Isi." }] }] }]} />);
  expect(example).toMatch(/<h4[^>]*>[\s\S]*?class="katex"[\s\S]*?<\/h4>/);
});
