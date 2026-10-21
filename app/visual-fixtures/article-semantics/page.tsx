import { notFound } from "next/navigation";
import { ArticleParts } from "@/components/course/article-parts";
import { semanticArticleParts } from "@/tests/fixtures/product-learning/article-semantics";

export default function ArticleSemanticsFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto max-w-prose p-4 text-body-base leading-relaxed text-foreground"><h1 className="mb-6 font-heading text-h5">Syarat dan transformasi</h1><ArticleParts parts={semanticArticleParts} /></main>;
}
