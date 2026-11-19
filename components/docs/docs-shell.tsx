"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { docSectionId, getAdminDocs, getTutorDocs } from "@/lib/docs";
import type { DocSurface } from "@/lib/docs/types";
import { cn } from "@/lib/utils";

function DocsNavigation({
  surface,
  basePath: basePathProp,
  onNavigate,
}: {
  surface: DocSurface;
  basePath?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations(surface === "tutor" ? "tutor.docs" : "admin.docs");
  const { locale } = useAppLocale();
  const pathname = usePathname();
  const basePath = basePathProp ?? (surface === "tutor" ? "/tutor/docs" : "/admin/docs");
  const docs = useMemo(
    () => (surface === "tutor" ? getTutorDocs(locale) : getAdminDocs(locale)),
    [surface, locale],
  );
  const currentSlug = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1)
    : "";
  const currentDoc = useMemo(
    () => docs.find((doc) => doc.slug === currentSlug),
    [docs, currentSlug],
  );

  const [activeSectionId, setActiveSectionId] = useState("");

  useEffect(() => {
    if (!currentDoc) {
      setActiveSectionId("");
      return;
    }

    const sectionIds = currentDoc.sections.map((_, index) => docSectionId(index));
    const syncHash = () => {
      const hashId = window.location.hash.replace(/^#/, "");
      if (hashId && sectionIds.includes(hashId)) {
        setActiveSectionId(hashId);
      } else if (sectionIds[0]) {
        setActiveSectionId(sectionIds[0]);
      }
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0 || typeof IntersectionObserver === "undefined") {
      return () => window.removeEventListener("hashchange", syncHash);
    }

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        const firstVisible = sectionIds.find((id) => visible.has(id));
        if (firstVisible) {
          setActiveSectionId(firstVisible);
        }
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncHash);
    };
  }, [currentDoc]);

  const categories = useMemo(
    () => [...new Set(docs.map((doc) => doc.category))],
    [docs],
  );
  const isIndex = pathname === basePath;

  return (
    <nav aria-label={t("navigation")} className="px-4 py-3">
      <Link
        href={basePath}
        onClick={onNavigate}
        aria-current={isIndex ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md py-1.5 text-metadata transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isIndex
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
        <span>{t("allDocs")}</span>
      </Link>

      <div className="mt-1">
        {categories.map((category) => (
          <section key={category} className="mt-5 first:mt-3">
            <h2 className="mb-1.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </h2>
            <ul className="space-y-0.5">
              {docs
                .filter((doc) => doc.category === category)
                .map((doc) => {
                  const isCurrent = currentSlug === doc.slug;
                  return (
                    <li key={doc.slug}>
                      <Link
                        href={`${basePath}/${doc.slug}`}
                        onClick={onNavigate}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "block break-words rounded-md py-1.5 text-metadata transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {doc.title}
                      </Link>
                      {isCurrent && doc.sections.length > 0 && (
                        <ul className="my-1 ml-1 space-y-0.5 border-l border-border">
                          {doc.sections.map((section, index) => {
                            const id = docSectionId(index);
                            const isActiveSection = activeSectionId === id;
                            return (
                              <li key={id}>
                                <Link
                                  href={`${basePath}/${doc.slug}#${id}`}
                                  onClick={() => {
                                    setActiveSectionId(id);
                                    onNavigate?.();
                                  }}
                                  aria-current={isActiveSection ? "location" : undefined}
                                  className={cn(
                                    "-ml-px block break-words border-l-2 py-1 pl-3 text-metadata transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isActiveSection
                                      ? "border-zx-accent text-foreground"
                                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                                  )}
                                >
                                  {section.title}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

export function DocsShell({
  surface,
  basePath,
  children,
}: {
  surface: DocSurface;
  basePath?: string;
  children: ReactNode;
}) {
  const t = useTranslations(surface === "tutor" ? "tutor.docs" : "admin.docs");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full min-w-0 gap-8">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex justify-end xl:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <ListTree className="size-4" aria-hidden />
                {t("navigation")}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0">
              <SheetHeader className="border-b border-border pr-12">
                <SheetTitle>{t("navigation")}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t("navigationDescription")}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DocsNavigation surface={surface} basePath={basePath} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </div>

      <aside
        aria-label={t("navigation")}
        className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 overflow-y-auto border-l border-border/80 xl:block"
      >
        <DocsNavigation surface={surface} basePath={basePath} />
      </aside>
    </div>
  );
}
