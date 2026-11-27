export const textDocumentSources = ["canonical-article", "canonical-diktat", "legacy-article"] as const;
export type TextDocumentSource = typeof textDocumentSources[number];
export type TextDocumentStatus = "draft" | "published";
export const textDocumentMarkdownLimit = 1_000_000;

export type TextDocumentEdit = {
  source: TextDocumentSource;
  revision: string;
  title: string;
  markdown: string;
  chapterId: string | null;
  chapters: Array<{ id: string; title: string }>;
  status: TextDocumentStatus;
};

export type TextDocumentDraft = { source: TextDocumentSource; expectedRevision: string } & (
  | { action: "content"; title: string; markdown: string; chapterId: string | null }
  | { action: "status"; status: TextDocumentStatus }
);
