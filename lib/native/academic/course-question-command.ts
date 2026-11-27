import { z } from "zod";
import type { AdminEntityDeleteDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

const deletion = z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
type Services = CourseCommandAuth & {
  remove(slug: string, id: string, draft: AdminEntityDeleteDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

export function handleAdminCourseQuestionCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, courses, slug, section, id] = parts;
  if (request.method !== "DELETE" || parts.length !== 5 || role !== "admin" || courses !== "courses" || section !== "questions") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (![slug, id].every(validCourseCommandId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: deletion, invalidError: "INVALID_QUESTION",
    write: (draft, requestId, viewer) => services.remove(slug, id, draft, requestId, viewer),
  });
}
