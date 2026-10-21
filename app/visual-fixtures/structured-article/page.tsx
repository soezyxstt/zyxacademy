import { notFound } from "next/navigation";
import { StructuredArticleVisualFixture } from "./visual-fixture";
import { readFile } from "node:fs/promises";
import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";

export const dynamic = "force-dynamic";

export default async function StructuredArticleVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; catalogueTitle?: string; editorialChapter?: string; orderedParts?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode, catalogueTitle, editorialChapter, orderedParts } = await searchParams;
  let editorialArticle;
  if (editorialChapter && /^[1-5]$/.test(editorialChapter)) {
    const candidate = JSON.parse(await readFile(`${process.cwd()}/.temp/math-editorial/bab${editorialChapter}/candidate.json`, "utf8"));
    const article = candidate.products.find((product: { productType: string }) => product.productType === "article");
    editorialArticle = buildPublicArticleReadModel(
      { ...article, status: "published" },
      article.sections.map((section: { kind: string }) => ({ ...section, sectionKind: section.kind, status: "published" })),
      article.sections.flatMap((section: { id: string; blocks: Array<{ contentMarkdown: string }> }) => section.blocks.map(block => ({ ...block, bagianArtikelId: section.id, content: block.contentMarkdown, status: "published" }))),
      [],
      { id: article.chapterId, number: Number(editorialChapter), title: article.title.replace(/^Bab \d+: /, "") },
    );
  }
  return <StructuredArticleVisualFixture mode={mode === "idea" || mode === "product" ? mode : "student"} catalogueTitle={catalogueTitle === "1"} editorialArticle={editorialArticle} orderedParts={orderedParts === "1"} />;
}
