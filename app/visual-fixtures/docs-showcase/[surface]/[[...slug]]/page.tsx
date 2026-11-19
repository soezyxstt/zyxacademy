import { notFound } from "next/navigation";
import { DocsShell } from "@/components/docs/docs-shell";
import { DocsIndexView } from "@/components/docs/docs-index-view";
import { DocsArticleView } from "@/components/docs/docs-article-view";
import { getAdminDocs, getTutorDocs } from "@/lib/docs";
import type { DocLocale, DocSurface } from "@/lib/docs/types";

export default async function DocsShowcaseFixture({
  params,
  searchParams,
}: {
  params: Promise<{ surface: string; slug?: string[] }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ surface: rawSurface, slug }, { locale: rawLocale }] = await Promise.all([
    params,
    searchParams,
  ]);

  if (rawSurface !== "admin" && rawSurface !== "tutor") {
    notFound();
  }

  const surface: DocSurface = rawSurface;
  const locale: DocLocale = rawLocale === "en" ? "en" : "id";
  const basePath = `/visual-fixtures/docs-showcase/${surface}`;
  const docs = surface === "tutor" ? getTutorDocs(locale) : getAdminDocs(locale);
  const targetSlug = slug?.[0];

  if (!targetSlug) {
    return (
      <main className="min-h-screen bg-background px-6 py-8 text-foreground">
        <div className="mx-auto max-w-6xl">
          <DocsShell surface={surface} basePath={basePath} localeOverride={locale}>
            <DocsIndexView surface={surface} basePath={basePath} localeOverride={locale} />
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
        <DocsShell surface={surface} basePath={basePath} localeOverride={locale}>
          <DocsArticleView
            doc={doc}
            docs={docs}
            surface={surface}
            basePath={basePath}
            locale={locale}
            allDocsLabel={locale === "en" ? "All guides" : "Semua panduan"}
            previousLabel={locale === "en" ? "Previous" : "Sebelumnya"}
            nextLabel={locale === "en" ? "Next" : "Berikutnya"}
            quickLinksLabel={locale === "en" ? "Quick access" : "Akses cepat"}
          />
        </DocsShell>
      </div>
    </main>
  );
}
