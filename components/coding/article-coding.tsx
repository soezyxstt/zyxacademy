"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CodingWorkspace } from "./coding-workspace";
import { Button } from "@/components/ui/button";
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

export function ArticleCodeExample({ part, draftNamespace = "example" }: { part: Extract<ArticlePart, { kind: "code_example" }>; draftNamespace?: "example" | "markdown-example" }) {
  const context = useContext(Context);
  if (!part.runnable || !context?.enabled) return <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-body-sm"><code>{part.code}</code></pre>;
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
