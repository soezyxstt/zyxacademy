import type { CourseMaterialSubcategory, MaterialLevel1Category } from "../../../../lib/course-materials";
import type { CoursePricingCategory } from "../../../academic/course-pricing";

export type AdminCourseEditDraft = {
  title: string;
  category: string;
  description: string | null;
  pricing?: AdminCourseCreateDraft["pricing"];
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

export type AdminDemoSelection = { enabled: boolean; expectedRevision: string; previousCourseId: string | null };
export type AdminDemoEditor = (courseId: string) => CourseWriteTarget<AdminDemoSelection>;

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
export type AdminChapterArchiveDraft = AdminCourseArchiveDraft;
export type AdminChapterArchiver = (courseId: string, chapterId: string) => CourseWriteTarget<AdminChapterArchiveDraft>;
export type AdminChapterOrderDraft = { chapterIds: string[]; expectedRevision: string };
export type AdminChapterReorder = (courseId: string) => CourseWriteTarget<AdminChapterOrderDraft>;

export type CoursePdfMetadata = {
  type: MaterialLevel1Category; subcategory: CourseMaterialSubcategory | null; year: number | null; chapterIds: string[];
};
export type AdminMaterialTitleDraft = { title: string; expectedRevision: string; metadata?: CoursePdfMetadata };
export type AdminMaterialTitleEdit = { title: string; revision: string; metadata?: CoursePdfMetadata; chapters?: { id: string; title: string }[] };
export type AdminMaterialEditor = (courseId: string, materialId: string) => CourseWriteTarget<AdminMaterialTitleDraft> & { remove?: CourseWriteTarget<AdminEntityDeleteDraft> };

export function validAdminMaterialTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= 500 && !trimmed.includes("\0");
}

export type AdminEntityDeleteDraft = { expectedRevision: string; confirmed: true };
export type AdminCourseQuestionRemover = (courseId: string, questionId: string) => CourseWriteTarget<AdminEntityDeleteDraft>;
export type AdminVideoRemover = (courseId: string, playlistId: string, videoId?: string) => CourseWriteTarget<AdminEntityDeleteDraft>;

export type AdminFlashcardStatus = "draft" | "published" | "retired";
export type AdminFlashcardSetDraft = {
  title: string;
  chapterId: string | null;
  status: AdminFlashcardStatus;
  expectedRevision: string | null;
};
export type AdminFlashcardDraft = {
  front: string;
  back: string;
  explanation: string | null;
  status: AdminFlashcardStatus;
  targetSetId: string;
  expectedRevision: string | null;
};
export type AdminFlashcardEditor = {
  saveSet(courseId: string, setId?: string): CourseWriteTarget<AdminFlashcardSetDraft>;
  saveCard(courseId: string, setId: string, cardId?: string): CourseWriteTarget<AdminFlashcardDraft>;
  remove(courseId: string, setId: string, cardId?: string): CourseWriteTarget<AdminEntityDeleteDraft>;
};
