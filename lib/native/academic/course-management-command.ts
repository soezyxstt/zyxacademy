import { z } from "zod";
import { allowedCategories } from "../../../packages/academic/course-categories";
import { coursePricingSchema } from "./course-pricing-schema";
import type { AdminCourseArchiveDraft, AdminCourseCreateDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  create(draft: AdminCourseCreateDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
  archive(slug: string, draft: AdminCourseArchiveDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const createDraft = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  title: z.string().trim().min(1).max(500),
  category: z.enum(allowedCategories),
  description: z.string().trim().max(20_000).nullable(),
  pricing: coursePricingSchema,
}).strict();

const archiveDraft = z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();

export function handleAdminCourseManagementCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section] = parts;
  if (role !== "admin" || collection !== "courses") return courseCommandReply(404, { error: "NOT_FOUND" });
  if (parts.length === 2) {
    return handleCourseCommand(request, origin, services, { schema: createDraft, invalidError: "INVALID_COURSE", write: services.create });
  }
  if (parts.length !== 4 || section !== "archive") return courseCommandReply(404, { error: "NOT_FOUND" });
  if (!validCourseCommandId(slug)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: archiveDraft, invalidError: "INVALID_COURSE", write: (draft, key, viewer) => services.archive(slug, draft, key, viewer),
  });
}
