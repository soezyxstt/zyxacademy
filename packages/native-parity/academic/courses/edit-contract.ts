export type AdminCourseEditDraft = {
  title: string;
  category: string;
  description: string | null;
  expectedRevision: string;
};

export type AdminCourseEditResponse =
  | { status: "saved" }
  | { status: "invalid" | "denied" | "missing" | "conflict" | "retry" };

export type AdminCourseEditor = (slug: string, draft: AdminCourseEditDraft, requestId: string, signal: AbortSignal) => Promise<AdminCourseEditResponse>;

export type AdminChapterDraft = {
  title: string;
  description: string | null;
  expectedRevision: string;
};

export type AdminChapterEditor = (
  slug: string, chapterId: string | undefined, draft: AdminChapterDraft, requestId: string, signal: AbortSignal,
) => Promise<AdminCourseEditResponse>;
