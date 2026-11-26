import type { CoursePricingCategory } from "../../../academic/course-pricing";

export type AdminCourseEditDraft = {
  title: string;
  category: string;
  description: string | null;
  expectedRevision: string;
};

export type AdminCourseEditResponse =
  | { status: "saved" }
  | { status: "invalid" | "denied" | "missing" | "conflict" | "exists" | "dependencies" | "retry" };

export type PendingCourseWrite<Draft> = { requestId: string; draft: Draft; confirmed: boolean };

export type CourseWriteTarget<Draft> = {
  pending(): PendingCourseWrite<Draft> | null;
  submit(draft: Draft, requestId: string, signal: AbortSignal): Promise<AdminCourseEditResponse>;
  acknowledge(requestId: string): void;
};

export type AdminCourseEditor = (courseId: string) => CourseWriteTarget<AdminCourseEditDraft>;

export type AdminCourseCreateDraft = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  pricing: { category: CoursePricingCategory; startsAt: string | null; endsAt: string | null };
};
export type AdminCourseArchiveDraft = { expectedRevision: string; confirmed: true };
export type AdminCourseArchiver = (courseId: string) => CourseWriteTarget<AdminCourseArchiveDraft>;

export type AdminChapterDraft = {
  title: string;
  description: string | null;
  expectedRevision: string;
};

export type AdminChapterEditor = (courseId: string, chapterId?: string) => CourseWriteTarget<AdminChapterDraft>;

export type AdminMaterialTitleDraft = { title: string; expectedRevision: string };
export type AdminMaterialTitleEdit = { title: string; revision: string };
export type AdminMaterialEditor = (courseId: string, materialId: string) => CourseWriteTarget<AdminMaterialTitleDraft>;

export function validAdminMaterialTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= 500 && !trimmed.includes("\0");
}
