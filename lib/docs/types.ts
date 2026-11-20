export type DocLocale = "id" | "en";

export type DocSurface = "admin" | "tutor";

export type DocCalloutVariant = "info" | "tip" | "warning" | "danger";

export type DocStep = {
  title?: string;
  body: string;
};

export type DocCallout = {
  variant: DocCalloutVariant;
  title?: string;
  body: string;
};

export type DocCodeBlock = {
  label?: string;
  code: string;
};

export type DocTable = {
  caption?: string;
  headers: string[];
  rows: string[][];
};

export type DocDiagramId =
  | "course-hierarchy"
  | "filename-anatomy"
  | "upload-duplicate-flow"
  | "mcp-authoring-pipeline"
  | "assessment-workflows"
  | "token-group-flow"
  | "tutorial-schedule-lifecycle"
  | "meet-access-modes"
  | "quiz-vs-tryout"
  | "tutor-workspace-map"
  | "tutor-grading-flow"
  | "tutor-live-quiz-flow";

export type DocQuickLink = {
  label: string;
  href: string;
  description?: string;
};

export type DocSection = {
  title: string;
  paragraphs?: string[];
  steps?: (string | DocStep)[];
  examples?: string[];
  callouts?: DocCallout[];
  codeBlocks?: DocCodeBlock[];
  table?: DocTable;
  diagram?: DocDiagramId;
};

export type DocEntry = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  quickLinks?: DocQuickLink[];
  sections: DocSection[];
};

export type BilingualDocEntry = {
  slug: string;
  id: Omit<DocEntry, "slug">;
  en: Omit<DocEntry, "slug">;
};
