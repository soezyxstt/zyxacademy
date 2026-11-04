"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { demoRoute, type DemoRouteView } from "@/lib/demo/routes";
import { demoSelectionHref } from "@/lib/demo/selection";
import type { DemoContent, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";

type ProductView = "article" | "diktat" | "flashcards" | "quiz";
export function DemoProductControls({ view, courseId, content, selection }: { view: ProductView; courseId: string; content: DemoContent; selection: DemoProductSelection }) {
  const t = useTranslations("marketing");
  const { locale } = useAppLocale();
  const base = demoRoute(locale, view as DemoRouteView, courseId);
  const href = (changes: Partial<Record<keyof DemoProductSelection, string | number | null>>) => demoSelectionHref(base, selection, changes);
  const page = content.collections.page;
  const config = view === "article" ? { key: "articleId" as const, items: content.collections.articles, selected: content.selected.articleId, title: content.article.title } : view === "diktat" ? { key: "diktatId" as const, items: content.collections.diktats, selected: content.selected.diktatId, title: content.diktat.title } : view === "flashcards" ? { key: "flashcardSetId" as const, items: content.collections.flashcardSets, selected: content.selected.flashcardSetId, title: content.collections.flashcardSets.find((item) => item.id === content.selected.flashcardSetId)?.title } : null;
  const showCollection = config && (config.items.length > 1 || page.offset > 0 || page.hasMore);
  const metadata = view === "quiz" ? content.collections.quiz : view === "flashcards" ? content.collections.flashcards : null;
  const offsetKey = view === "quiz" ? "quizOffset" : "flashcardOffset";
  const previous = metadata && metadata.offset > 0 ? Math.max(0, metadata.offset - metadata.pageSize) : null;
  if (!showCollection && previous === null && (!metadata || metadata.nextOffset === null)) return null;
  return <div className="mb-4 flex flex-wrap items-center gap-2">
    {showCollection && config && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="max-w-full"><span className="truncate">{config.title ?? t("demo.products.choose")}</span><ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 max-w-80 overflow-y-auto">{config.items.map((item) => <DropdownMenuItem asChild key={item.id}><Link href={href({ [config.key]: item.id, ...(config.key === "flashcardSetId" ? { flashcardOffset: null } : {}) })} aria-current={item.id === config.selected ? "true" : undefined}>{item.title}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
    {showCollection && page.offset > 0 && <Button asChild variant="outline" size="sm"><Link href={href({ collectionOffset: Math.max(0, page.offset - page.pageSize) })}>{t("demo.products.previousProducts")}</Link></Button>}
    {showCollection && page.nextOffset !== null && <Button asChild variant="outline" size="sm"><Link href={href({ collectionOffset: page.nextOffset })}>{t("demo.products.nextProducts")}</Link></Button>}
    {metadata && previous !== null && <Button asChild variant="outline" size="sm"><Link href={href({ [offsetKey]: previous })}>{t("demo.products.previousPage")}</Link></Button>}
    {metadata && metadata.nextOffset !== null && <Button asChild variant="outline" size="sm"><Link href={href({ [offsetKey]: metadata.nextOffset })}>{t("demo.products.nextPage")}</Link></Button>}
  </div>;
}
