"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
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
}: {
  surface: DocSurface;
  basePath?: string;
}) {
  const t = useTranslations(surface === "tutor" ? "tutor.docs" : "admin.docs");
  const { locale } = useAppLocale();
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
    <div className="min-w-0 space-y-(--group-gap)">
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
            <section key={category} aria-label={category} className="space-y-1.5">
              <h2 className="font-heading text-section-title font-bold text-foreground">
                {category}
              </h2>
              <ul className="divide-y divide-border/55 border-t border-border/55">
                {results
                  .filter((doc) => doc.category === category)
                  .map((doc) => (
                    <li key={doc.slug}>
                      <Link
                        href={`${basePath}/${doc.slug}`}
                        className="block min-h-11 rounded-md py-(--row-padding) transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="block wrap-anywhere text-body-sm font-semibold text-foreground">
                          {doc.title}
                        </span>
                        <span className="mt-0.5 block wrap-anywhere text-body-xs text-muted-foreground">
                          <DocRichText text={doc.summary} />
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
