"use client";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { CodingWorkspace } from "./coding-workspace";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CodingProblemPublic } from "@/lib/coding/contracts";
import type { ArticlePart } from "@/lib/materials/article-parts";
import { codingProblemPublicSchema } from "@/lib/coding/contracts";
import { appendArticleMarkdownScope } from "@/lib/coding/article-markdown-scope";

type ArticleCodingContext = { courseId: string; articleId: string; articleVersion: number; enabled: boolean; browserOnly?: boolean };
const Context = createContext<ArticleCodingContext | null>(null);
const MarkdownScope = createContext<string | null>(null);
export function ArticleMarkdownScope({ id, children }: { id: string; children: ReactNode }) {
  const parent = useContext(MarkdownScope);
  return <MarkdownScope.Provider value={appendArticleMarkdownScope(parent, id)}>{children}</MarkdownScope.Provider>;
}
export function useArticleMarkdownScope() {
  const context = useContext(Context);
  const scope = useContext(MarkdownScope);
  return context?.enabled ? scope : null;
}
export function ArticleCodingProvider({ value, children }: { value: ArticleCodingContext; children: ReactNode }) {
  const { courseId, articleId, articleVersion, enabled, browserOnly = false } = value;
  const stable = useMemo(() => ({ courseId, articleId, articleVersion, enabled, browserOnly }), [courseId, articleId, articleVersion, enabled, browserOnly]);
  return <Context.Provider value={stable}>{children}</Context.Provider>;
}

export type StaticCodeLabels = { region: string; overflow: string; left: string; right: string; copy: string; copied: string; copyFailed: string; plainText: string };
const StaticCodeReadingContext = createContext<StaticCodeLabels | null>(null);
export function StaticCodeReadingProvider({ labels, children }: { labels: StaticCodeLabels; children: ReactNode }) {
  return <StaticCodeReadingContext.Provider value={labels}>{children}</StaticCodeReadingContext.Provider>;
}
export function useStaticCodeLabels() { return useContext(StaticCodeReadingContext); }


/** Optional reading controls for static examples, without changing coding workspaces. */
export function ScrollableStaticCode({ code, labels, language }: { code: string; labels: StaticCodeLabels; language?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const hintId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [copyCount, setCopyCount] = useState(0);
  useEffect(() => setCopyState("idle"), [code]);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });
  const measure = () => {
    const element = ref.current;
    if (!element) return;
    const next = { overflow: element.scrollWidth > element.clientWidth + 1, left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 };
    setScroll(previous => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right ? previous : next);
  };
  useEffect(() => {
    let active = true;
    const check = () => { if (active) measure(); };
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    check();
    void document.fonts.ready.then(check);
    return () => { active = false; observer.disconnect(); };
  }, [code]);
  const move = (direction: number) => {
    if (ref.current) ref.current.scrollLeft += direction * Math.max(80, ref.current.clientWidth / 2);
    measure();
  };
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-body-xs font-mono text-muted-foreground">{language?.trim() || labels.plainText}</span>
      <div className="flex flex-wrap items-center gap-1">
        {scroll.overflow ? <TooltipProvider>
          <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon" className="size-8" aria-label={labels.left} disabled={!scroll.left} onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button></TooltipTrigger><TooltipContent>{labels.left}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon" className="size-8" aria-label={labels.right} disabled={!scroll.right} onClick={() => move(1)}><ChevronRight className="size-4" /></Button></TooltipTrigger><TooltipContent>{labels.right}</TooltipContent></Tooltip>
        </TooltipProvider> : null}
        <Button type="button" variant="outline" size="sm" onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopyState("copied"); setCopyCount(count => count + 1); }
          catch { setCopyState("failed"); ref.current?.focus(); }
        }}>{copyState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}{copyState === "copied" ? labels.copied : labels.copy}</Button>
      </div>
    </div>
    {scroll.overflow ? <p id={hintId} className="text-body-xs text-muted-foreground">{labels.overflow}</p> : null}
    {copyState === "failed" ? <p role="status" className="text-body-xs text-muted-foreground">{labels.copyFailed}</p> : null}
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{copyState === "copied" ? <span key={copyCount} data-copy-announcement={copyCount}>{labels.copied}</span> : null}</span>
    <pre ref={ref} role="region" aria-label={labels.region} aria-describedby={scroll.overflow ? hintId : undefined} tabIndex={0} onScroll={measure} onKeyDown={(event) => {
      if (!scroll.overflow) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); if (ref.current) ref.current.scrollLeft = event.key === "Home" ? 0 : ref.current.scrollWidth; measure(); }
    }} className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><code>{code}</code></pre>
  </div>;
}

export function ArticleCodeExample({ part, draftNamespace = "example", staticCodeLabels }: { part: Extract<ArticlePart, { kind: "code_example" }>; draftNamespace?: "example" | "markdown-example"; staticCodeLabels?: StaticCodeLabels }) {
  const context = useContext(Context);
  if (!part.runnable || !context?.enabled) return staticCodeLabels ? <ScrollableStaticCode code={part.code} labels={staticCodeLabels} language={part.language} /> : <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-body-sm"><code>{part.code}</code></pre>;
  return <CodingWorkspace key={`${draftNamespace}:${context.articleId}:${context.articleVersion}:${part.id}`} courseId={context.courseId} draftKey={`${draftNamespace}:${context.articleId}:${context.articleVersion}:${part.id}`} initialCode={part.code} allowHelp={false} browserOnly={context.browserOnly} playgroundLink interactive />;
}
export function ArticleCodingExercise({ part }: { part: Extract<ArticlePart, { kind: "coding_exercise" }> }) {
  const context = useContext(Context);
  const [problem, setProblem] = useState<CodingProblemPublic | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!context?.enabled) return;
    const abort = new AbortController(); setError("");
    void fetch(`/api/coding/problems/${encodeURIComponent(part.problem.problemId)}?${new URLSearchParams({ courseId: context.courseId, version: String(part.problem.version) })}`, { signal: abort.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Masalah coding belum tersedia.");
      setProblem(codingProblemPublicSchema.parse(body.problem));
    }).catch((error) => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Masalah coding belum tersedia."); });
    return () => abort.abort();
  }, [context, part.problem.problemId, part.problem.version, retry]);
  if (!context?.enabled) return <p className="text-body-sm text-muted-foreground">Latihan Python: {part.problem.problemId}, versi {part.problem.version}.</p>;
  if (error) return <div role="alert" className="space-y-2 rounded-lg border border-border p-3 text-body-sm"><p>{error}</p><Button variant="outline" className="text-body-sm" onClick={() => setRetry((value) => value + 1)}>Coba lagi</Button></div>;
  if (!problem) return <p role="status" className="text-body-sm text-muted-foreground">Memuat masalah coding...</p>;
  return <CodingWorkspace key={`${context.articleId}:${context.articleVersion}:${part.id}:${problem.problemId}:${problem.version}`} courseId={context.courseId} draftKey={`exercise:${context.articleId}:${context.articleVersion}:${part.id}`} problem={problem} surface={{ kind: "article", articleId: context.articleId, articleVersion: context.articleVersion, partId: part.id }} playgroundLink />;
}
