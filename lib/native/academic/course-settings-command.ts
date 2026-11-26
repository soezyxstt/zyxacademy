import { coursePricingSchema } from "./course-pricing-schema";
import { z } from "zod";
import { allowedCategories } from "../../../packages/academic/course-categories";
import type { AdminCourseEditDraft, AdminDemoSelection } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

export function handleAdminDemoSelection(request: Request, parts: string[], origin: string, services: CourseCommandAuth & {
  save(slug: string, draft: AdminDemoSelection, key: string, viewer: CourseCommandViewer): Promise<void>;
}) {
  const [role, collection, slug, action] = parts;
  if (parts.length !== 4 || role !== "admin" || collection !== "courses" || action !== "demo" || request.method !== "PATCH") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (!validCourseCommandId(slug)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: z.object({ enabled: z.boolean(), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
      previousCourseId: z.string().refine(validCourseCommandId).nullable() }).strict(),
    invalidError: "INVALID_COURSE", write: (draft, key, viewer) => services.save(slug, draft, key, viewer),
  });
}

type Services = CourseCommandAuth & {
  update(slug: string, draft: AdminCourseEditDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const bodySchema = z.object({
  pricing: coursePricingSchema.optional(),
  title: z.string().trim().min(1).max(500),
  category: z.enum([...allowedCategories, "Umum"]),
  description: z.string().trim().max(20_000).nullable(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function handleAdminCourseSettingsCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section] = parts;
  if (parts.length !== 4 || role !== "admin" || collection !== "courses" || section !== "settings") {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (!validCourseCommandId(slug)) return courseCommandReply(400, { error: "INVALID_PATH" });
  return handleCourseCommand(request, origin, services, {
    schema: bodySchema, invalidError: "INVALID_COURSE",
    write: (draft, requestId, viewer) => services.update(slug, draft, requestId, viewer),
  });
}
