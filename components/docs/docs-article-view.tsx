import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Info,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import { DocRichText } from "./doc-rich-text";
import { DocCodeBlock } from "./doc-code-block";
import { DocDiagram } from "./doc-diagrams";
import { docSectionId } from "@/lib/docs/search";
import type {
  DocCalloutVariant,
  DocEntry,
  DocLocale,
  DocSurface,
} from "@/lib/docs/types";
import { cn } from "@/lib/utils";

const CALLOUT_STYLES: Record<
  DocCalloutVariant,
  { border: string; iconColor: string; Icon: typeof Info }
> = {
  info: {
    border: "border-l-status-info",
    iconColor: "text-status-info",
    Icon: Info,
  },
  tip: {
    border: "border-l-status-success",
    iconColor: "text-status-success",
    Icon: Lightbulb,
  },
  warning: {
    border: "border-l-status-warning",
    iconColor: "text-status-warning",
    Icon: AlertTriangle,
  },
  danger: {
    border: "border-l-status-error",
    iconColor: "text-status-error",
    Icon: ShieldAlert,
  },
};

export function DocsArticleView({
  doc,
  docs,
  surface,
  basePath: basePathProp,
  locale,
  allDocsLabel,
  previousLabel,
  nextLabel,
  quickLinksLabel,
}: {
  doc: DocEntry;
  docs: DocEntry[];
  surface: DocSurface;
  basePath?: string;
  locale: DocLocale;
  allDocsLabel: string;
  previousLabel: string;
  nextLabel: string;
  quickLinksLabel: string;
}) {
  const basePath = basePathProp ?? (surface === "tutor" ? "/tutor/docs" : "/admin/docs");
  const currentIndex = docs.findIndex((item) => item.slug === doc.slug);
  const previousDoc = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const nextDoc =
    currentIndex >= 0 && currentIndex < docs.length - 1
      ? docs[currentIndex + 1]
      : null;

  return (
    <div className="min-w-0 max-w-3xl">
      <header className="space-y-2">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-metadata text-muted-foreground"
        >
          <Link
            href={basePath}
            className="transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {allDocsLabel}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
          <span className="text-foreground/80">{doc.category}</span>
        </nav>

        <h1 className="wrap-anywhere font-heading text-reading-major font-bold tracking-tight text-foreground">
          {doc.title}
        </h1>

        <p className="text-body-base text-muted-foreground">
          <DocRichText text={doc.summary} />
        </p>
      </header>

      {doc.quickLinks && doc.quickLinks.length > 0 && (
        <nav
          aria-label={quickLinksLabel}
          className="mt-(--related-gap) flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border/55 py-(--compact-gap)"
        >
          <span className="text-body-xs font-semibold text-muted-foreground">
            {quickLinksLabel}
          </span>
          {doc.quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              className="inline-flex min-h-9 min-w-0 max-w-full items-center gap-1 rounded-md text-body-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="wrap-anywhere">{item.label}</span>
              <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </nav>
      )}

      <article className="mt-(--section-gap) text-body-base text-foreground/85">
        {doc.sections.map((section, index) => (
          <section
            key={section.title}
            id={docSectionId(index)}
            className="scroll-mt-20 mt-(--reading-section-gap) first:mt-0"
          >
            <h2 className="mb-(--compact-gap) font-heading text-reading-minor font-bold tracking-tight text-foreground">
              {section.title}
            </h2>

            {section.diagram && <DocDiagram id={section.diagram} locale={locale} />}

            {section.paragraphs && (
              <div className="space-y-(--paragraph-gap)">
                {section.paragraphs.map((paragraph, pIdx) => (
                  <p key={pIdx}>
                    <DocRichText text={paragraph} />
                  </p>
                ))}
              </div>
            )}

            {section.steps && section.steps.length > 0 && (
              <ol className="my-(--group-gap) space-y-(--related-gap)">
                {section.steps.map((step, sIdx) => {
                  const normalized =
                    typeof step === "string" ? { body: step } : step;
                  return (
                    <li key={sIdx} className="flex gap-3.5">
                      <span
                        aria-hidden
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 font-mono text-metadata font-semibold text-foreground"
                      >
                        {sIdx + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        {normalized.title && (
                          <p className="font-semibold text-foreground leading-snug">
                            {normalized.title}
                          </p>
                        )}
                        <p className="text-foreground/85">
                          <DocRichText text={normalized.body} />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {section.examples && section.examples.length > 0 && (
              <ul className="my-(--related-gap) list-disc space-y-2 pl-6">
                {section.examples.map((example, eIdx) => (
                  <li key={eIdx} className="break-words">
                    <DocRichText text={example} />
                  </li>
                ))}
              </ul>
            )}

            {section.codeBlocks?.map((block, cIdx) => (
              <DocCodeBlock
                key={cIdx}
                label={block.label}
                code={block.code}
                locale={locale}
              />
            ))}

            {section.table && (
              <div className="my-(--group-gap)">
                {/* Desktop table */}
                <div className="hidden md:block">
                  <table className="w-full border-collapse text-left text-support">
                    {section.table.caption && (
                      <caption className="sr-only">{section.table.caption}</caption>
                    )}
                    <thead className="border-y border-border/55">
                      <tr>
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-3.5 py-(--table-row-padding) text-metadata font-semibold text-foreground"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/80">
                      {section.table.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="align-top">
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              className="wrap-anywhere px-3.5 py-(--table-row-padding) text-support text-foreground/85"
                            >
                              <DocRichText text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile vertical stacked rows (no horizontal table scroll) */}
                <div
                  aria-label={section.table.caption}
                  className="divide-y divide-border/55 border-y border-border/55 md:hidden"
                >
                  {section.table.rows.map((row, rIdx) => (
                    <dl key={rIdx} className="space-y-2 py-(--row-padding)">
                      {row.map((cell, cellIdx) => (
                        <div key={cellIdx} className="space-y-0.5">
                          <dt className="text-metadata font-semibold text-muted-foreground">
                            {section.table?.headers[cellIdx]}
                          </dt>
                          <dd className="wrap-anywhere text-support text-foreground/85">
                            <DocRichText text={cell} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                </div>
              </div>
            )}

            {section.callouts?.map((callout, calloutIdx) => {
              const style = CALLOUT_STYLES[callout.variant];
              const Icon = style.Icon;
              return (
                <div
                  key={calloutIdx}
                  className={cn(
                    "my-(--group-gap) flex gap-2.5 border-l-2 py-1.5 pl-3",
                    style.border,
                  )}
                >
                  <Icon
                    className={cn("mt-0.5 size-4 shrink-0", style.iconColor)}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 space-y-1 text-support">
                    {callout.title && (
                      <p className="font-semibold text-foreground">{callout.title}</p>
                    )}
                    <p className="text-foreground/85">
                      <DocRichText text={callout.body} />
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </article>

      {(previousDoc || nextDoc) && (
        <nav
          aria-label={locale === "en" ? "Guide pagination" : "Navigasi antar panduan"}
          className="mt-(--section-gap) grid gap-(--related-gap) border-t border-border/55 pt-(--related-gap) sm:grid-cols-2 sm:items-center"
        >
          <div className="min-w-0">
            {previousDoc && (
              <Link
                href={`${basePath}/${previousDoc.slug}`}
                className="group inline-flex max-w-full items-center gap-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ArrowLeft
                  className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-body-2xs uppercase tracking-wider text-muted-foreground">
                    {previousLabel}
                  </span>
                  <span className="block break-words font-medium text-foreground group-hover:text-brand-primary transition-colors">
                    {previousDoc.title}
                  </span>
                </span>
              </Link>
            )}
          </div>

          <div className="min-w-0 sm:text-right">
            {nextDoc && (
              <Link
                href={`${basePath}/${nextDoc.slug}`}
                className="group inline-flex max-w-full items-center gap-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block text-body-2xs uppercase tracking-wider text-muted-foreground">
                    {nextLabel}
                  </span>
                  <span className="block break-words font-medium text-foreground group-hover:text-brand-primary transition-colors">
                    {nextDoc.title}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
