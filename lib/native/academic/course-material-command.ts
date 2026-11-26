import { z } from "zod";
import { validAdminMaterialTitle, type AdminMaterialTitleDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  update(slug: string, materialId: string, draft: AdminMaterialTitleDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const bodySchema = z.object({
  title: z.string().trim().refine(validAdminMaterialTitle),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export function handleAdminCourseMaterialCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section, materialId, target] = parts;
  if (request.method !== "PATCH" || parts.length !== 6 || role !== "admin" || collection !== "courses" ||
    section !== "documents" || target !== "metadata") return courseCommandReply(404, { error: "NOT_FOUND" });
  if (![slug, materialId].every(validCourseCommandId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: bodySchema, invalidError: "INVALID_MATERIAL",
    write: (draft, requestId, viewer) => services.update(slug, materialId, draft, requestId, viewer),
  });
}
