import { notFound } from "next/navigation";
import { DocsShell } from "@/components/docs/docs-shell";
import { DocsIndexView } from "@/components/docs/docs-index-view";
import { DocsArticleView } from "@/components/docs/docs-article-view";
import { getAdminDocs, getTutorDocs } from "@/lib/docs";
import type { DocSurface } from "@/lib/docs/types";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export default async function DocsShowcaseFixture({
  params,
}: {
  params: Promise<{ surface: string; slug?: string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { surface: rawSurface, slug } = await params;
  if ((rawSurface !== "admin" && rawSurface !== "tutor") || (slug && slug.length > 1)) {
    notFound();
  }

  const surface: DocSurface = rawSurface;
  const [locale, t] = await Promise.all([
    getAppLocale(),
    getTranslations(surface === "tutor" ? "tutor.docs" : "admin.docs"),
  ]);
  const basePath = `/visual-fixtures/docs-showcase/${surface}`;
  const docs = surface === "tutor" ? getTutorDocs(locale) : getAdminDocs(locale);
  const targetSlug = slug?.[0];

  if (!targetSlug) {
    return (
      <main className="min-h-screen bg-background px-6 py-8 text-foreground">
        <div className="mx-auto max-w-6xl">
          <DocsShell surface={surface} basePath={basePath}>
            <DocsIndexView surface={surface} basePath={basePath} />
          </DocsShell>
        </div>
      </main>
    );
  }

  const doc = docs.find((item) => item.slug === targetSlug);
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        <DocsShell surface={surface} basePath={basePath}>
          <DocsArticleView
            doc={doc}
            docs={docs}
            surface={surface}
            basePath={basePath}
            locale={locale}
            allDocsLabel={t("allDocs")}
            previousLabel={t("previous")}
            nextLabel={t("next")}
            quickLinksLabel={t("quickLinks")}
          />
        </DocsShell>
      </div>
    </main>
  );
}
