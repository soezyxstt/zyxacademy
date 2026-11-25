import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-section-content";
import { MathText } from "@/components/course/math-text";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import studentCourse from "@/messages/id/studentCourse.json";
import learning from "@/messages/id/learning.json";
import "./preview-graph-runtime";

function Preview() {
  const [article, setArticle] = useState<PublicArticleReadModel | null>(null);
  useEffect(() => {
    void fetch("./article.json").then(response => {
      if (!response.ok) throw new Error("PREVIEW_ARTICLE_UNAVAILABLE");
      return response.json();
    }).then(setArticle).catch(error => { document.documentElement.dataset.previewError = error.message; });
  }, []);
  useEffect(() => { if (article) document.documentElement.dataset.previewReady = "true"; }, [article]);
  if (!article) return null;
  return <NextIntlClientProvider locale="id" messages={{ studentCourse, learning }} timeZone="UTC">
    <main className="mx-auto w-full min-w-0 max-w-3xl px-3.5 py-3.5 sm:px-6 sm:py-6 lg:px-8">
      <div className="article-editorial mx-auto max-w-[66ch]">
        <h1 className="mb-(--reading-section-gap) font-heading text-h5 font-bold"><MathText>{article.title}</MathText></h1>
        {article.sections.map(section => <article key={section.id} id={`section-${section.slug}`} data-preview-section={section.id}
          className="scroll-mt-16 space-y-3.5 sm:space-y-6 [&+article]:mt-7 [&+article]:border-t [&+article]:border-border/40 [&+article]:pt-4 md:[&+article]:mt-14 md:[&+article]:pt-5">
          <StructuredArticleSectionContent section={section} articleId={article.id} articleVersion={article.version} showProgress={false} interactiveChecks={false} />
        </article>)}
      </div>
    </main>
  </NextIntlClientProvider>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
