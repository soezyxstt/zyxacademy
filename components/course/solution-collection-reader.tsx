"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, CheckCircle2, Circle, ChevronLeft, ChevronRight, List, Search } from "lucide-react";
import { useLocale } from "next-intl";
import { Component, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { ArticleCodingProvider, StaticCodeReadingProvider } from "@/components/coding/article-coding";
import { ArticleParts } from "@/components/course/article-parts";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { materializeArticleParts, type ArticlePart } from "@/lib/materials/article-parts";
import { useTranslations } from "@/lib/i18n/client";
import type { SolutionCollection, SolutionCollectionItem, SolutionProvenance } from "@/lib/materials/solution-collection";

export interface SolutionCollectionReaderProps {
  collection: SolutionCollection;
  courseHref?: string;
  backHref?: string;
  initialRevealed?: boolean;
  embedded?: boolean;
  itemReviewStatus?: Record<string, "complete" | "incomplete">;
  renderItemReview?: (item: SolutionCollectionItem) => ReactNode;
}

class ContentFallback extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <p role="alert" className="rounded-lg border border-border p-4 text-body-sm">{this.props.message}</p>;
    return this.props.children;
  }
}

const ITEMS_PER_PAGE = 20;

function ItemList({ collection, activeId, onSelect, itemReviewStatus }: {
  collection: SolutionCollection;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  itemReviewStatus?: Record<string, "complete" | "incomplete">;
}) {
  const t = useTranslations("learning.solutionCollection");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(() => Math.floor(Math.max(0, collection.items.findIndex((item) => item.id === activeId)) / ITEMS_PER_PAGE));
  const listHelpId = useId();
  const listRef = useRef<HTMLElement>(null);
  const focusActiveAfterSearch = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const searchableItems = useMemo(() => collection.items.map((item, index) => ({
    item, index, searchText: `${index + 1} ${item.title} ${materializeArticleParts(item.prompt)}`.toLocaleLowerCase(locale),
  })), [collection.items, locale]);
  const matches = useMemo(() => normalized ? searchableItems.filter(({ searchText }) => searchText.includes(normalized)) : searchableItems, [searchableItems, normalized]);
  const pageCount = Math.max(1, Math.ceil(matches.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleMatches = matches.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
  const previousActiveId = useRef(activeId);
  const pendingActiveScroll = useRef(activeId);
  useEffect(() => {
    if (previousActiveId.current === activeId) return;
    previousActiveId.current = activeId;
    pendingActiveScroll.current = activeId;
    const matchIndex = matches.findIndex(({ item }) => item.id === activeId);
    if (matchIndex >= 0) setPage(Math.floor(matchIndex / ITEMS_PER_PAGE));
    else if (normalized) {
      setQuery("");
      const activeIndex = collection.items.findIndex(item => item.id === activeId);
      setPage(Math.floor(Math.max(0, activeIndex) / ITEMS_PER_PAGE));
    }
  }, [activeId, collection.items, matches, normalized]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const fitList = () => {
      const bounds = list.getBoundingClientRect();
      if (bounds.width) list.style.maxHeight = `${Math.max(120, window.innerHeight - Math.max(0, bounds.top) - 24)}px`;
    };
    fitList();
    const index = collection.items.findIndex(item => item.id === pendingActiveScroll.current);
    const button = list.querySelector<HTMLButtonElement>(`button[data-item-index="${index}"]`);
    if (button) {
      const bounds = list.getBoundingClientRect(), itemBounds = button.getBoundingClientRect();
      if (itemBounds.top < bounds.top) list.scrollTop -= bounds.top - itemBounds.top;
      else if (itemBounds.bottom > bounds.bottom) list.scrollTop += itemBounds.bottom - bounds.bottom;
      pendingActiveScroll.current = undefined;
    }
    window.addEventListener("resize", fitList);
    window.addEventListener("scroll", fitList, { passive: true });
    return () => { window.removeEventListener("resize", fitList); window.removeEventListener("scroll", fitList); };
  }, [activeId, collection.items, currentPage, matches]);

  const focusItem = (id: string) => {
    const matchIndex = matches.findIndex(({ item }) => item.id === id);
    if (matchIndex < 0) return;
    const targetPage = Math.floor(matchIndex / ITEMS_PER_PAGE);
    if (targetPage !== currentPage) {
      pendingFocus.current = id;
      setPage(targetPage);
    } else listRef.current?.querySelector<HTMLButtonElement>(`button[data-item-index="${matches[matchIndex].index}"]`)?.focus();
  };
  useEffect(() => {
    if (focusActiveAfterSearch.current && activeId && !query) {
      focusActiveAfterSearch.current = false;
      focusItem(activeId);
    }
  // This effect runs after clearing the search so the active button is mounted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeId]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const index = collection.items.findIndex((item) => item.id === pendingFocus.current);
    const button = listRef.current?.querySelector<HTMLButtonElement>(`button[data-item-index="${index}"]`);
    if (button) {
      pendingFocus.current = null;
      button.focus();
    }
  }, [collection.items, currentPage, query]);
  const goToActive = () => {
    if (!activeId) return;
    if (!matches.some(({ item }) => item.id === activeId)) {
      focusActiveAfterSearch.current = true;
      setQuery("");
    } else focusItem(activeId);
  };
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, currentId: string) => {
    const current = matches.findIndex(({ item }) => item.id === currentId);
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = Math.min(current + 1, matches.length - 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = matches.length - 1;
    else if (event.key === "PageDown") next = Math.min(current + 10, matches.length - 1);
    else if (event.key === "PageUp") next = Math.max(current - 10, 0);
    else return;
    event.preventDefault();
    focusItem(matches[next].item.id);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SearchBar size="sm" value={query} onSearch={(value) => { pendingFocus.current = null; focusActiveAfterSearch.current = false; setQuery(value); setPage(0); }} aria-label={t("search")} placeholder={t("search")} />
      <Button type="button" variant="outline" size="sm" className="h-auto min-h-7 whitespace-normal py-1" onClick={goToActive}>{t("goToActive")}</Button>
      {pageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-7 whitespace-normal py-1" aria-label={t("previousPage")} disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); }}>{t("previous")}</Button>
        <span role="status" className="text-body-xs text-muted-foreground">{t("pageProgress", { current: currentPage + 1, total: pageCount })}</span>
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-7 whitespace-normal py-1" aria-label={t("nextPage")} disabled={currentPage === pageCount - 1} onClick={() => { setPage(currentPage + 1); }}>{t("next")}</Button>
      </div> : null}
      {matches.length ? (
        <nav ref={listRef} aria-label={t("itemList")} aria-describedby={listHelpId} className="min-h-0 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]" data-solution-list>
          <p id={listHelpId} className="px-3 pb-2 text-body-xs text-muted-foreground">{t("listKeyboardHelp")}</p>
          <ol className="space-y-1">
            {visibleMatches.map(({ item, index }) => (
              <li key={item.id} aria-posinset={index + 1} aria-setsize={collection.items.length}>
                <button type="button" data-item-index={index} tabIndex={0} aria-describedby={listHelpId} aria-current={item.id === activeId ? "true" : undefined} onKeyDown={(event) => moveFocus(event, item.id)} onClick={() => onSelect(item.id)}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.id === activeId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
                  <span className="min-w-0 flex-1 break-words"><MathText>{item.title}</MathText></span>
                  {itemReviewStatus ? itemReviewStatus[item.id] === "complete" ? <CheckCircle2 role="img" aria-label={t("reviewComplete")} className="mt-0.5 size-4 shrink-0 text-status-success" /> : <Circle role="img" aria-label={t("reviewIncomplete")} className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : <div role="status"><AdminEmptyState icon={Search} title={collection.items.length ? t("noMatches") : t("noItems")} className="py-6 text-body-sm" /></div>}
    </div>
  );
}

function Parts({ parts, item, compact = false }: { parts: ArticlePart[]; item: SolutionCollectionItem; compact?: boolean }) {
  const t = useTranslations("learning.solutionCollection");
  return <ContentFallback message={t("contentError")}><ArticleParts parts={parts} visuals={item.visuals} density={compact ? "compact" : undefined} staticCodeLabels={{ region: t("staticCode"), overflow: t("codeOverflow"), left: t("codeLeft"), right: t("codeRight"), copy: t("copyCode"), copied: t("copiedCode"), copyFailed: t("copyCodeFailed"), plainText: t("plainCode") }} /></ContentFallback>;
}

// A single inline formula is kept inline in answer choices instead of being
// promoted by the Markdown compiler to a display-formula panel.
function OptionParts({ parts, item }: { parts: ArticlePart[]; item: SolutionCollectionItem }) {
  const t = useTranslations("learning.solutionCollection");
  return <ContentFallback message={t("contentError")}><div className="min-w-0 space-y-2">{parts.map((part) => part.kind === "markdown" ? (
    <MarkdownRenderer key={part.id} content={/^\s*\$(?!\$)[\s\S]*?\$\s*$/.test(part.markdown) ? `\u200b${part.markdown}` : part.markdown} density="compact" />
  ) : <Parts key={part.id} parts={[part]} item={item} compact />)}</div></ContentFallback>;
}

function Provenance({ label, provenance }: { label: string; provenance: SolutionProvenance }) {
  return <div className="space-y-1">
    <p><span className="font-semibold">{label}:</span> {provenance.attribution}</p>
    {provenance.sources.length ? <ul className="space-y-1">{provenance.sources.map((source, index) => <li key={`${source.title}-${source.locator}-${index}`}>
      {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{source.title}</a> : source.title}, {source.locator}
    </li>)}</ul> : null}
  </div>;
}

function ActiveItem({ item, index, total, onPrevious, onNext, headingRef, initialRevealed, renderItemReview }: {
  item: SolutionCollectionItem;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initialRevealed?: boolean;
  renderItemReview?: (item: SolutionCollectionItem) => ReactNode;
}) {
  const t = useTranslations("learning.solutionCollection");
  const [revealed, setRevealed] = useState(Boolean(initialRevealed));
  const [hintOpen, setHintOpen] = useState(false);
  const solutionId = useId();
  const hintId = useId();
  const strategyLabel = item.template === "conceptual" ? t("approach") : t("strategy");
  const stepLabels = { choice: t("explanationSteps"), calculation: t("calculationSteps"), conceptual: t("explanationFlow"), code_trace: t("codeTrace"), code_construction: t("codeConstruction") };
  return (
    <article className="min-w-0 space-y-7" data-solution-item={item.id}>
      <header className="space-y-2 border-b border-border pb-5">
        <p className="text-body-xs font-semibold text-muted-foreground">{t("itemProgress", { current: index + 1, total })}</p>
        <h2 ref={headingRef} tabIndex={-1} className="rounded-sm font-heading text-body-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><MathText>{item.title}</MathText></h2>
      </header>
      <section aria-label={t("question")} className="space-y-5">
        <Parts parts={item.prompt} item={item} />
        {item.options.length ? <ol className="divide-y divide-border" aria-label={t("answerOptions")}>
          {item.options.map((option, optionIndex) => <li key={option.id} className="flex min-w-0 items-start gap-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-body-sm font-semibold">{String.fromCharCode(65 + optionIndex)}</span>
            <div className="min-w-0 flex-1 overflow-x-auto pt-0.5"><OptionParts parts={option.parts} item={item} /></div>
          </li>)}
        </ol> : null}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        {!revealed && item.hintMarkdown ? <Button type="button" variant="outline" className="h-auto min-h-8 whitespace-normal py-1" aria-expanded={hintOpen} aria-controls={hintId} onClick={() => setHintOpen((value) => !value)}>{hintOpen ? t("hideHint") : t("showHint")}</Button> : null}
        <Button type="button" className="h-auto min-h-8 whitespace-normal py-1" aria-expanded={revealed} aria-controls={solutionId} onClick={() => { setRevealed((value) => !value); setHintOpen(false); }}>
          {revealed ? t("hideSolution") : t("showSolution")}
        </Button>
      </div>
      {!revealed && hintOpen && item.hintMarkdown ? <section id={hintId} aria-label={t("hint")} className="space-y-3 border-l-2 border-border pl-4"><h3 className="font-heading text-body-base font-bold">{t("hint")}</h3><MarkdownRenderer content={item.hintMarkdown} /></section> : <div id={hintId} hidden />}
      {revealed ? <div id={solutionId} className="space-y-7 border-t border-border pt-6">
        <section className="space-y-3" aria-labelledby={`${solutionId}-answer`}>
          <h3 id={`${solutionId}-answer`} className="font-heading text-body-base font-bold">{t("answer")}</h3>
          {item.answer.optionIds.length ? <p className="text-body-sm font-semibold text-primary">{item.answer.optionIds.map((answerId) => String.fromCharCode(65 + item.options.findIndex((option) => option.id === answerId))).join(", ")}</p> : null}
          <Parts parts={item.answer.parts} item={item} />
        </section>
        <section className="space-y-3" aria-labelledby={`${solutionId}-strategy`}>
          <h3 id={`${solutionId}-strategy`} className="font-heading text-body-base font-bold">{strategyLabel}</h3>
          <Parts parts={item.strategy} item={item} />
        </section>
        <section className="space-y-4" aria-labelledby={`${solutionId}-steps`}>
          <h3 id={`${solutionId}-steps`} className="font-heading text-body-base font-bold">{stepLabels[item.template]}</h3>
          <ol className="space-y-6">
            {item.steps.map((step, stepIndex) => <li key={step.id} className="min-w-0 space-y-3 border-l-2 border-primary/40 pl-4" data-solution-step={step.id}>
              <div className="flex items-start gap-2"><span className="shrink-0 text-body-sm font-semibold text-muted-foreground">{stepIndex + 1}.</span><div className="min-w-0"><MarkdownRenderer content={step.operationMarkdown} /></div></div>
              {step.parts ? <Parts parts={step.parts} item={item} /> : null}
              <div className="text-muted-foreground"><MarkdownRenderer content={step.reasonMarkdown} /></div>
              {step.conditionsMarkdown ? <MarkdownRenderer content={step.conditionsMarkdown} /> : null}
            </li>)}
          </ol>
        </section>
        <section className="space-y-3" aria-labelledby={`${solutionId}-verification`}>
          <h3 id={`${solutionId}-verification`} className="font-heading text-body-base font-bold">{t("verification")}</h3>
          <Parts parts={item.verification} item={item} />
        </section>
        {item.misconceptions?.length ? <section className="space-y-3" aria-labelledby={`${solutionId}-misconceptions`}>
          <h3 id={`${solutionId}-misconceptions`} className="font-heading text-body-base font-bold">{t("misconceptions")}</h3>
          <ul className="space-y-4">{item.misconceptions.map((entry) => <li key={entry.id} className="space-y-3 border-l-2 border-border pl-4"><div className="space-y-1"><h4 className="text-body-xs font-semibold text-muted-foreground">{t("misconception")}</h4><MarkdownRenderer content={entry.misconceptionMarkdown} /></div><div className="space-y-1"><h4 className="text-body-xs font-semibold text-foreground">{t("correction")}</h4><MarkdownRenderer content={entry.correctionMarkdown} /></div></li>)}</ul>
        </section> : null}
      </div> : <div id={solutionId} hidden />}
      <details className="text-body-sm text-muted-foreground">
        <summary className="cursor-pointer rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("sources")}</summary>
        <div className="mt-3 space-y-3"><Provenance label={t("question")} provenance={item.provenance.problem} /><Provenance label={t("solution")} provenance={item.provenance.solution} /></div>
      </details>
      {renderItemReview?.(item)}
      <nav aria-label={t("navigation")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button type="button" variant="outline" className="h-auto min-h-8 whitespace-normal py-1" onClick={onPrevious} disabled={index === 0}><ChevronLeft aria-hidden="true" />{t("previous")}</Button>
        <Button type="button" variant="outline" className="h-auto min-h-8 whitespace-normal py-1" onClick={onNext} disabled={index === total - 1}>{t("next")}<ChevronRight aria-hidden="true" /></Button>
      </nav>
    </article>
  );
}

function ReaderContent({ collection, courseHref, backHref, initialRevealed, renderItemReview, embedded = false, itemReviewStatus }: SolutionCollectionReaderProps) {
  const t = useTranslations("learning.solutionCollection");
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const requestedId = searchParams.get("item");
  const requestedIndex = collection.items.findIndex((item) => item.id === requestedId);
  const activeIndex = requestedIndex < 0 ? 0 : requestedIndex;
  const active = collection.items[activeIndex];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousId = useRef(active?.id);
  const selectingFromSheet = useRef(false);
  useEffect(() => {
    if (active?.id && previousId.current !== active.id) headingRef.current?.focus();
    previousId.current = active?.id;
  }, [active?.id]);
  const selectItem = (itemId: string) => {
    if (itemId !== active?.id || requestedId !== itemId) {
      selectingFromSheet.current = sheetOpen && itemId !== active?.id;
      const url = new URL(window.location.href);
      url.searchParams.set("item", itemId);
      window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setSheetOpen(false);
  };
  return <div className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6"}>
    {active ? <Button variant="outline" className="sr-only text-body-sm focus:not-sr-only" onClick={() => headingRef.current?.focus()}>{t("skipToQuestion")}</Button> : null}
    {!embedded ? <PageHeader title={collection.title} backHref={backHref ?? courseHref} backLabel={t("back")} /> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 text-body-sm text-muted-foreground">
      <p>{courseHref ? <Link href={courseHref} className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{collection.course.title}</Link> : collection.course.title}<span aria-hidden="true"> / </span>{collection.chapter.title}</p>
      {active ? <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild><Button variant="outline" className="h-auto min-h-8 whitespace-normal py-1 lg:hidden"><List aria-hidden="true" />{t("itemList")}</Button></SheetTrigger>
        <SheetContent side="left" className="w-[min(85vw,24rem)] gap-0" aria-describedby={undefined} onCloseAutoFocus={(event) => {
          if (selectingFromSheet.current) {
            event.preventDefault();
            headingRef.current?.focus();
          }
          selectingFromSheet.current = false;
        }}>
          <SheetHeader><SheetTitle>{t("itemList")}</SheetTitle></SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4"><ItemList collection={collection} activeId={active.id} onSelect={selectItem} itemReviewStatus={itemReviewStatus} /></div>
        </SheetContent>
      </Sheet> : null}
    </div>
    {active ? <div className="grid min-w-0 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] xl:gap-12">
      <aside className="hidden min-w-0 lg:block"><div className="sticky top-6 space-y-3"><h2 className="font-heading text-body-base font-bold">{t("itemList")}</h2><ItemList collection={collection} activeId={active.id} onSelect={selectItem} itemReviewStatus={itemReviewStatus} /></div></aside>
      <div className="min-w-0 max-w-3xl">
        {requestedId && requestedIndex < 0 ? <p role="status" className="mb-5 rounded-lg border border-border p-3 text-body-sm text-muted-foreground">{t("invalidItem")}</p> : null}
        <ActiveItem key={active.id} initialRevealed={initialRevealed} renderItemReview={renderItemReview} item={active} index={activeIndex} total={collection.items.length} headingRef={headingRef} onPrevious={() => selectItem(collection.items[activeIndex - 1].id)} onNext={() => selectItem(collection.items[activeIndex + 1].id)} />
      </div>
    </div> : <div role="status"><AdminEmptyState icon={BookOpen} title={t("emptyCollection")} /></div>}
  </div>;
}

/** Pass only a parsed, authorized, explicitly released learning collection. */
export function SolutionCollectionReader(props: SolutionCollectionReaderProps) {
  const t = useTranslations("learning.solutionCollection");
  // A collection stays static even if a caller nests it in a coding-enabled article.
  return <ArticleCodingProvider value={{ courseId: props.collection.course.id, articleId: props.collection.id, articleVersion: 1, enabled: false }}>
    <StaticCodeReadingProvider labels={{ region: t("staticCode"), overflow: t("codeOverflow"), left: t("codeLeft"), right: t("codeRight"), copy: t("copyCode"), copied: t("copiedCode"), copyFailed: t("copyCodeFailed"), plainText: t("plainCode") }}><Suspense fallback={<p role="status" className="p-6 text-body-sm text-muted-foreground">{t("loading")}</p>}><ReaderContent {...props} /></Suspense></StaticCodeReadingProvider>
  </ArticleCodingProvider>;
}
