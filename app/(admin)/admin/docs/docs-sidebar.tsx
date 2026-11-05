"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/client";
import { adminDocs, docSectionId } from "@/lib/admin-docs";
import { cn } from "@/lib/utils";

function DocsNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("admin.docs");
  const pathname = usePathname();
  const currentSlug = pathname.startsWith("/admin/docs/") ? pathname.slice("/admin/docs/".length) : "";
  const [expanded, setExpanded] = useState(currentSlug);
  const [hash, setHash] = useState("");

  useEffect(() => {
    setExpanded(currentSlug);
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [currentSlug]);

  const categories = [...new Set(adminDocs.map((doc) => doc.category))];
  return (
    <nav aria-label={t("navigation")} className="space-y-5 p-3">
      <Link href="/admin/docs" onClick={onNavigate} aria-current={pathname === "/admin/docs" ? "page" : undefined} className={cn("block rounded-md px-2 py-2 text-body-sm font-semibold hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pathname === "/admin/docs" && "bg-primary/10 text-primary")}>
        {t("allDocs")}
      </Link>
      {categories.map((category) => (
        <section key={category} lang="id">
          <h2 className="px-2 pb-1 text-body-xs font-semibold text-muted-foreground">{category}</h2>
          <ul className="space-y-0.5">
            {adminDocs.filter((doc) => doc.category === category).map((doc) => {
              const isCurrent = currentSlug === doc.slug;
              const isExpanded = expanded === doc.slug;
              return (
                <li key={doc.slug}>
                  <div className={cn("flex items-start rounded-md hover:bg-muted/60", isCurrent && "bg-primary/10 text-primary")}>
                    <Link href={`/admin/docs/${doc.slug}`} onClick={onNavigate} aria-current={isCurrent ? "page" : undefined} className="min-w-0 flex-1 break-words px-2 py-2 text-body-sm leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {doc.title}
                    </Link>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("sectionsFor", { title: doc.title })} aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? "" : doc.slug)} className="shrink-0">
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>
                  </div>
                  {isExpanded && <ul className="ml-4 my-1 space-y-0.5 border-l border-border pl-2">
                    {doc.sections.map((section, index) => {
                      const id = docSectionId(index);
                      return <li key={id}><Link href={`/admin/docs/${doc.slug}#${id}`} onClick={() => { setHash(`#${id}`); onNavigate?.(); }} aria-current={isCurrent && hash === `#${id}` ? "location" : undefined} className={cn("block break-words rounded-md px-2 py-1.5 text-body-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isCurrent && hash === `#${id}` && "text-primary font-semibold")}>{section.title}</Link></li>;
                    })}
                  </ul>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function DocsSidebar({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.docs");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 max-w-6xl gap-6">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex justify-end xl:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm"><ListTree className="size-4" />{t("navigation")}</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0">
              <SheetHeader className="border-b border-border pr-12">
                <SheetTitle>{t("navigation")}</SheetTitle>
                <SheetDescription className="sr-only">{t("navigationDescription")}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto"><DocsNavigation onNavigate={() => setOpen(false)} /></div>
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </div>
      <aside aria-label={t("navigation")} className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 overflow-y-auto border-l border-border xl:block">
        <h2 className="px-5 pt-3 font-heading text-body-sm font-bold">{t("navigation")}</h2>
        <DocsNavigation />
      </aside>
    </div>
  );
}
