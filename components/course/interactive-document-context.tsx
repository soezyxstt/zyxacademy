"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

import { interactiveDocumentPath, type ArticleField, type AttemptField, type InteractiveDocumentScope, type TryoutField } from "@/lib/materials/interactive-document-path";

const Context = createContext<InteractiveDocumentScope | null>(null);

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
  return interactiveDocumentPath(useContext(Context), spec);
}
