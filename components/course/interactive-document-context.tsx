"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

type ArticleField = { courseId: string; articleId: string; articleVersion: number; sectionId?: string; blockId?: string; partId?: string; field?: "visual_ref" | "markdown" | "content" | "section_visual"; optionId?: string; draftId?: string; draftChecksum?: string };
type GrantedField = { grant: string };
type AttemptField = { courseId: string; attemptId: string; questionId: string; field: "prompt" | "option" | "explanation"; option?: number };
type TryoutField = { courseId: string; examId: string; questionId: string; field: "prompt" | "option"; option?: number };
const Context = createContext<ArticleField | GrantedField | AttemptField | TryoutField | null>(null);

export function InteractiveDocumentTryout({ value, children }: { value: TryoutField | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function InteractiveDocumentAttempt({ value, children }: { value: AttemptField | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function InteractiveDocumentArticle({ value, children }: { value: ArticleField | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function InteractiveDocumentGrant({ grant, children }: { grant?: string; children: ReactNode }) {
  return <Context.Provider value={grant ? { grant } : null}>{children}</Context.Provider>;
}

export function InteractiveDocumentArticleLocation({ sectionId, blockId, partId, field, optionId, children }: { sectionId?: string; blockId?: string; partId?: string; field?: "visual_ref" | "markdown" | "content" | "section_visual"; optionId?: string; children: ReactNode }) {
  const value = useContext(Context);
  const article = value && "articleId" in value ? { ...value, ...(sectionId ? { sectionId } : {}), ...(blockId ? { blockId } : {}), ...(partId ? { partId } : {}), ...(field ? { field } : {}), ...(optionId ? { optionId } : {}) } : null;
  return <Context.Provider value={article}>{children}</Context.Provider>;
}

export function useInteractiveDocumentUrl(spec: InteractiveDocumentSpec): string | undefined {
  const context = useContext(Context);
  if (!context) return undefined;
  if ("grant" in context) {
    const query = new URLSearchParams({ grant: context.grant, visualId: spec.id, hash: spec.documentSha256, kind: "document" });
    return `/api/materials/interactive-document/reveal?${query}`;
  }
  if ("attemptId" in context) {
    const query = new URLSearchParams({ courseId: context.courseId, attemptId: context.attemptId, questionId: context.questionId, field: context.field, ...(context.option === undefined ? {} : { option: String(context.option) }), visualId: spec.id, hash: spec.documentSha256, kind: "document" });
    return `/api/materials/interactive-document/attempt?${query}`;
  }
  if ("examId" in context) {
    const query = new URLSearchParams({ courseId: context.courseId, examId: context.examId, questionId: context.questionId, field: context.field, ...(context.option === undefined ? {} : { option: String(context.option) }), visualId: spec.id, hash: spec.documentSha256, kind: "document" });
    return `/api/materials/interactive-document/tryout?${query}`;
  }
  if ("articleId" in context) {
    if (!context.sectionId) return undefined;
    if (context.field === "section_visual" && !context.draftId) {
      const query = new URLSearchParams({ courseId: context.courseId, articleId: context.articleId, articleVersion: String(context.articleVersion), sectionId: context.sectionId, field: "section_visual", visualId: spec.id, hash: spec.documentSha256, kind: "document" });
      return `/api/materials/interactive-document/article?${query}`;
    }
    if (context.field === "section_visual") return undefined;
    if (!context.blockId) return undefined;
    if (context.optionId) {
      const query = new URLSearchParams({ courseId: context.courseId, articleId: context.articleId, articleVersion: String(context.articleVersion), sectionId: context.sectionId, blockId: context.blockId, optionId: context.optionId, visualId: spec.id, hash: spec.documentSha256, kind: "document" });
      if (context.draftId && context.draftChecksum) { query.set("draftId", context.draftId); query.set("checksum", context.draftChecksum); }
      return `/api/materials/interactive-document/option?${query}`;
    }
    if (!context.field || (context.field !== "content" && !context.partId)) return undefined;
    const query = new URLSearchParams({ courseId: context.courseId, articleId: context.articleId, articleVersion: String(context.articleVersion), sectionId: context.sectionId, blockId: context.blockId, field: context.field, ...(context.partId ? { partId: context.partId } : {}), visualId: spec.id, hash: spec.documentSha256, kind: "document" });
    if (context.draftId && context.draftChecksum) {
      query.set("checksum", context.draftChecksum);
      return `/api/admin/bundles/product/${encodeURIComponent(context.draftId)}/interactive-document?${query}`;
    }
    return `/api/materials/interactive-document/article?${query}`;
  }
  return undefined;
}
