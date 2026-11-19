"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { SearchBar } from "@/components/ui/search-bar";
import { DocRichText } from "./doc-rich-text";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { searchAdminDocs, searchTutorDocs } from "@/lib/docs";
import type { DocSurface } from "@/lib/docs/types";

export function DocsIndexView({
  surface,
  basePath: basePathProp,
  localeOverride,
}: {
  surface: DocSurface;
  basePath?: string;
  localeOverride?: "id" | "en";
}) {
  const t = useTranslations(surface === "tutor" ? "tutor.docs" : "admin.docs");
  const { locale: appLocale } = useAppLocale();
  const locale = localeOverride ?? appLocale;
  const [query, setQuery] = useState("");
  const basePath = basePathProp ?? (surface === "tutor" ? "/tutor/docs" : "/admin/docs");

  const results = useMemo(
    () => (surface === "tutor" ? searchTutorDocs(query, locale) : searchAdminDocs(query, locale)),
    [surface, query, locale],
  );
  const categories = useMemo(
    () => [...new Set(results.map((doc) => doc.category))],
    [results],
  );

  return (
    <div className="space-y-(--section-gap)">
      <PageHeader title={t("title")} />
      <div className="max-w-3xl space-y-(--section-gap)">
        <SearchBar
          value={query}
          onSearch={setQuery}
          aria-label={t("search")}
          placeholder={t("search")}
          size="sm"
        />

        {categories.length === 0 ? (
          <AdminEmptyState
            icon={Search}
            title={t("noResults")}
            description={t("tryAnother")}
          />
        ) : (
          categories.map((category) => (
            <section key={category} aria-label={category} className="space-y-2.5">
              <h2 className="font-heading text-section-title font-bold text-foreground">
                {category}
              </h2>
              <div className="divide-y divide-border border-y border-border">
                {results
                  .filter((doc) => doc.category === category)
                  .map((doc) => (
                    <Link
                      key={doc.slug}
                      href={`${basePath}/${doc.slug}`}
                      className="group flex items-center gap-3 py-(--row-padding) transition-colors hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-sm font-semibold text-foreground group-hover:text-brand-primary transition-colors">
                          {doc.title}
                        </span>
                        <span className="mt-1 block text-support text-muted-foreground">
                          <DocRichText text={doc.summary} />
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary"
                        aria-hidden
                      />
                    </Link>
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
