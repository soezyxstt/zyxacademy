import { z } from "zod";
import { tryoutDraftValidationError, type TryoutDraftReceipt, type TryoutDraftWrite } from "@/packages/native-parity/academic/assessment/tryout-draft";
import {
  courseCommandReply, readCourseCommandBody, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer,
} from "../course-command";

type Services = CourseCommandAuth & {
  save(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer): Promise<Omit<TryoutDraftReceipt, "requestId">>;
};

const draftSchema = z.object({
  courseId: z.string().refine(validCourseCommandId),
  title: z.string().trim().min(1).max(255),
  timeLimitMinutes: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  openAt: z.string().max(48).nullable(),
  closeAt: z.string().max(48).nullable(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();

export async function handleAdminTryoutDraftCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, slug, section, examId] = parts;
  const creating = request.method === "POST" && parts.length === 3;
  const editing = request.method === "PATCH" && parts.length === 4;
  const reply = courseCommandReply;
  if (role !== "admin" || section !== "tryouts" || (!creating && !editing)) return reply(404, { error: "NOT_FOUND" });
  if (!validCourseCommandId(slug) || (editing && !validCourseCommandId(examId))) return reply(400, { error: "INVALID_PATH" });
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });

  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await readCourseCommandBody(request, draftSchema);
    if (!body?.success || creating !== (body.data.expectedRevision === null) || tryoutDraftValidationError(body.data)) {
      return reply(422, { error: "INVALID_TRYOUT_DRAFT" });
    }
    const draft = body.data;
    const outcome = await services.save(slug, examId ?? null, {
      ...draft,
      openAt: draft.openAt ? new Date(draft.openAt).toISOString() : null,
      closeAt: draft.closeAt ? new Date(draft.closeAt).toISOString() : null,
    }, requestId, viewer);
    return reply(creating ? 201 : 200, { ...outcome, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "COURSE_NOT_FOUND" || code === "TRYOUT_NOT_FOUND") return reply(404, { error: code });
    if (code === "REQUEST_CONFLICT" || code === "REVISION_CONFLICT" || code === "TRYOUT_NOT_DRAFT" || code === "COURSE_CHANGED") {
      return reply(409, { error: code });
    }
    return reply(500, { error: "SAVE_FAILED" });
  }
}
