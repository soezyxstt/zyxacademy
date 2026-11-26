import { z } from "zod";
import { isValidSubcategory, SUBCATEGORY_LABELS, type CourseMaterialSubcategory } from "../../course-materials";
import { validAdminMaterialTitle, type AdminEntityDeleteDraft, type AdminMaterialTitleDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  update(slug: string, materialId: string, draft: AdminMaterialTitleDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const bodySchema = z.object({
  title: z.string().trim().refine(validAdminMaterialTitle),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: z.object({
    type: z.enum(["materi", "soal", "pembahasan_soal"]),
    subcategory: z.enum(Object.keys(SUBCATEGORY_LABELS) as CourseMaterialSubcategory[]).nullable(),
    year: z.number().int().min(1900).max(2100).nullable(),
    chapterIds: z.array(z.string().refine(validCourseCommandId)).min(1).max(200)
      .refine(ids => new Set(ids).size === ids.length),
  }).strict().refine(value => isValidSubcategory(value.type, value.subcategory)).optional(),
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

export function handleAdminCoursePdfDelete(request: Request, parts: string[], origin: string, services: CourseCommandAuth & {
  remove(slug: string, id: string, draft: AdminEntityDeleteDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
}) {
  const [role, collection, slug, section, id] = parts;
  if (request.method !== "DELETE" || parts.length !== 5 || role !== "admin" || collection !== "courses" || section !== "documents") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (![slug, id].every(validCourseCommandId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(),
    invalidError: "INVALID_MATERIAL",
    write: (draft, requestId, viewer) => services.remove(slug, id, draft, requestId, viewer),
  });
}
