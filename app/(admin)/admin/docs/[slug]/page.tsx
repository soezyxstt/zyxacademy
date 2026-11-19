import { notFound } from "next/navigation";
import { DocsArticleView } from "@/components/docs/docs-article-view";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { getAdminDocs } from "@/lib/docs";

export default async function AdminDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, locale, t] = await Promise.all([
    params,
    getAppLocale(),
    getTranslations("admin.docs"),
  ]);
  const docs = getAdminDocs(locale);
  const doc = docs.find((item) => item.slug === slug);
  if (!doc) notFound();

  return (
    <DocsArticleView
      doc={doc}
      docs={docs}
      surface="admin"
      locale={locale}
      allDocsLabel={t("allDocs")}
      previousLabel={t("previous")}
      nextLabel={t("next")}
      quickLinksLabel={t("quickLinks")}
    />
  );
}
