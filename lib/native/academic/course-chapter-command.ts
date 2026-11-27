import { z } from "zod";
import type { AdminChapterArchiveDraft, AdminChapterDraft, AdminChapterOrderDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  save(slug: string, chapterId: string | undefined, draft: AdminChapterDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
  archive(slug: string, chapterId: string, draft: AdminChapterArchiveDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
  reorder(slug: string, draft: AdminChapterOrderDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const revision = z.string().regex(/^[a-f0-9]{64}$/);
const bodySchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).nullable(),
  expectedRevision: revision,
}).strict();
const archiveSchema = z.object({ expectedRevision: revision, confirmed: z.literal(true) }).strict();
const reorderSchema = z.object({ expectedRevision: revision, chapterIds: z.array(z.string().refine(validCourseCommandId))
  .min(1).max(1000).refine(ids => new Set(ids).size === ids.length) }).strict();

export function handleAdminCourseChapterCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section, chapterId] = parts;
  const reorder = request.method === "POST" && chapterId === "order";
  const archive = request.method === "DELETE";
  const commandLength = request.method === "POST" ? (reorder ? 5 : 4) : request.method === "PATCH" || archive ? 5 : undefined;
  if (parts.length !== commandLength || role !== "admin" || collection !== "courses" || section !== "chapters") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (![slug, ...(chapterId !== undefined ? [chapterId] : [])].every(validCourseCommandId)) {
    return courseCommandReply(400, { error: "INVALID_PATH" });
  }
  if (reorder) return handleCourseCommand(request, origin, services, {
    schema: reorderSchema, invalidError: "INVALID_CHAPTER", maxBodyBytes: 1024 * 1024,
    write: (draft, key, viewer) => services.reorder(slug, draft, key, viewer),
  });
  if (archive) return handleCourseCommand(request, origin, services, {
    schema: archiveSchema, invalidError: "INVALID_CHAPTER", write: (draft, key, viewer) => services.archive(slug, chapterId, draft, key, viewer),
  });
  return handleCourseCommand(request, origin, services, {
    schema: bodySchema, invalidError: "INVALID_CHAPTER",
    write: (draft, requestId, viewer) => services.save(slug, chapterId, draft, requestId, viewer),
  });
}
