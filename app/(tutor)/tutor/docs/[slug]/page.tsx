import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticleView } from "@/components/docs/docs-article-view";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { getTutorDocs } from "@/lib/docs";
import { pageTitle } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, locale, t] = await Promise.all([
    params,
    getAppLocale(),
    getTranslations("tutor.docs"),
  ]);
  const doc = getTutorDocs(locale).find((item) => item.slug === slug);
  return {
    title: pageTitle(doc ? `${doc.title} | ${t("title")}` : t("title")),
    description: doc?.summary,
  };
}

export default async function TutorDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, locale, t] = await Promise.all([
    params,
    getAppLocale(),
    getTranslations("tutor.docs"),
  ]);
  const docs = getTutorDocs(locale);
  const doc = docs.find((item) => item.slug === slug);
  if (!doc) notFound();

  return (
    <DocsArticleView
      doc={doc}
      docs={docs}
      surface="tutor"
      locale={locale}
      allDocsLabel={t("allDocs")}
      previousLabel={t("previous")}
      nextLabel={t("next")}
      quickLinksLabel={t("quickLinks")}
    />
  );
}
