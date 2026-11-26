import { z } from "zod";
import type { AdminChapterDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  save(slug: string, chapterId: string | undefined, draft: AdminChapterDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const bodySchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).nullable(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export function handleAdminCourseChapterCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section, chapterId] = parts;
  const commandLength = request.method === "POST" ? 4 : request.method === "PATCH" ? 5 : undefined;
  if (parts.length !== commandLength || role !== "admin" || collection !== "courses" || section !== "chapters") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (![slug, ...(chapterId !== undefined ? [chapterId] : [])].every(validCourseCommandId)) {
    return courseCommandReply(400, { error: "INVALID_PATH" });
  }
  return handleCourseCommand(request, origin, services, {
    schema: bodySchema, invalidError: "INVALID_CHAPTER",
    write: (draft, requestId, viewer) => services.save(slug, chapterId, draft, requestId, viewer),
  });
}
