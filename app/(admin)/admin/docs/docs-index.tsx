"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { SearchBar } from "@/components/ui/search-bar";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { searchAdminDocs } from "@/lib/admin-docs";

export function DocsIndex() {
  const t = useTranslations("admin.docs");
  const { locale } = useAppLocale();
  const [query, setQuery] = useState("");
  const results = searchAdminDocs(query);
  const categories = [...new Set(results.map((doc) => doc.category))];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} icon={BookOpen} />
      <div className="max-w-4xl space-y-6">
        {locale === "en" && <p className="text-body-xs text-muted-foreground">{t("contentLanguage")}</p>}
        <SearchBar value={query} onSearch={setQuery} aria-label={t("search")} placeholder={t("search")} size="sm" />
        {categories.length === 0 ? (
          <AdminEmptyState icon={Search} title={t("noResults")} description={t("tryAnother")} />
        ) : categories.map((category) => (
          <section key={category} lang="id" aria-label={category}>
            <h2 className="font-heading text-body-base font-bold">{category}</h2>
            <div className="mt-2 divide-y divide-border border-y border-border">
              {results.filter((doc) => doc.category === category).map((doc) => (
                <Link key={doc.slug} href={`/admin/docs/${doc.slug}`} className="flex items-center gap-3 py-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <span className="min-w-0 flex-1"><span className="block text-body-sm font-semibold">{doc.title}</span><span className="mt-1 block text-body-xs text-muted-foreground">{doc.summary}</span></span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
