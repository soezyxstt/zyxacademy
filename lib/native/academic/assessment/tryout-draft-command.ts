import { z } from "zod";
import { questionTypes, questionValidationError } from "@/packages/native-parity/academic/assessment/model";
import { maxTryoutBankImport, tryoutDraftValidationError, tryoutStatuses, type TryoutContentReceipt, type TryoutContentWrite, type TryoutDraftReceipt, type TryoutDraftWrite, type TryoutMetadataReceipt, type TryoutMetadataWrite, type TryoutQuestionSetReceipt, type TryoutQuestionSetWrite } from "@/packages/native-parity/academic/assessment/tryout-draft";
import {
  courseCommandReply, readCourseCommandBody, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer,
} from "../course-command";

type Services = CourseCommandAuth & {
  save(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer): Promise<Omit<TryoutDraftReceipt, "requestId">>;
  saveMetadata(slug: string, examId: string | null, draft: TryoutMetadataWrite, requestId: string, viewer: CourseCommandViewer): Promise<Omit<TryoutMetadataReceipt, "requestId">>;
  writeContent(slug: string, examId: string, edit: TryoutContentWrite, requestId: string, viewer: CourseCommandViewer): Promise<Omit<TryoutContentReceipt, "requestId">>;
  changeQuestions(slug: string, examId: string, edit: TryoutQuestionSetWrite, requestId: string, viewer: CourseCommandViewer): Promise<Omit<TryoutQuestionSetReceipt, "requestId">>;
};

const idSchema = z.string().refine(validCourseCommandId);
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const draftSchema = z.object({
  courseId: idSchema,
  title: z.string().trim().min(1).max(255),
  timeLimitMinutes: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  openAt: z.string().max(48).nullable(),
  closeAt: z.string().max(48).nullable(),
  expectedRevision: revisionSchema.nullable(),
}).strict();
const metadataSchema = draftSchema.extend({ status: z.enum(tryoutStatuses) });
const questionSetFields = { courseId: idSchema, expectedRevision: revisionSchema };
const questionSetSchema = z.discriminatedUnion("action", [
  z.object({ ...questionSetFields, action: z.literal("import"), bankIds: z.array(idSchema).min(1).max(maxTryoutBankImport)
    .refine((ids) => new Set(ids).size === ids.length) }).strict(),
  z.object({ ...questionSetFields, action: z.literal("remove"), questionId: idSchema }).strict(),
]);

const deleteSchema = z.object(questionSetFields).strict();
const directQuestionSchema = z.object({
  ...questionSetFields,
  input: z.object({
    prompt: z.string().trim().min(1).max(8000),
    type: z.enum(Object.keys(questionTypes) as [keyof typeof questionTypes, ...Array<keyof typeof questionTypes>]),
    options: z.array(z.string().max(4000)).max(30),
    correctIndices: z.array(z.number().int().nonnegative()).max(30),
    acceptableAnswers: z.array(z.string().max(4000)).max(30),
    order: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    acceptsFile: z.boolean(),
  }).strict().refine(input => !questionValidationError(input)
    && new Set(input.correctIndices).size === input.correctIndices.length
    && (!input.acceptsFile || input.type === "essay")),
}).strict();

function normalizeDates<T extends TryoutDraftWrite>(draft: T): T {
  return {
    ...draft,
    openAt: draft.openAt ? new Date(draft.openAt).toISOString() : null,
    closeAt: draft.closeAt ? new Date(draft.closeAt).toISOString() : null,
  };
}

export async function handleAdminTryoutDraftCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, slug, section, examId, operation, questionId] = parts;
  const creatingMetadata = request.method === "POST" && parts.length === 4 && examId === "metadata";
  const editingMetadata = request.method === "PATCH" && parts.length === 5 && operation === "metadata";
  const creating = (request.method === "POST" && parts.length === 3) || creatingMetadata;
  const editing = (request.method === "PATCH" && parts.length === 4) || editingMetadata;
  const managingQuestions = request.method === "POST" && parts.length === 5 && operation === "questions";
  const creatingQuestion = request.method === "POST" && parts.length === 6 && operation === "questions" && questionId === "direct";
  const editingQuestion = request.method === "PATCH" && parts.length === 6 && operation === "questions";
  const deletingQuestion = request.method === "DELETE" && parts.length === 6 && operation === "questions";
  const deleting = request.method === "DELETE" && parts.length === 4;
  const reply = courseCommandReply;
  if (role !== "admin" || section !== "tryouts" || (!creating && !editing && !managingQuestions && !creatingQuestion && !editingQuestion && !deleting && !deletingQuestion)) return reply(404, { error: "NOT_FOUND" });
  if (!validCourseCommandId(slug) || (!creating && !validCourseCommandId(examId)) || ((editingQuestion || deletingQuestion) && !validCourseCommandId(questionId))) return reply(400, { error: "INVALID_PATH" });
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });

  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    if (deleting || deletingQuestion) {
      const body = await readCourseCommandBody(request, deleteSchema);
      if (!body?.success) return reply(422, { error: deletingQuestion ? "INVALID_TRYOUT_QUESTION" : "INVALID_TRYOUT_DELETE" });
      const edit: TryoutContentWrite = deletingQuestion
        ? { ...body.data, action: "delete-question", targetId: questionId }
        : { ...body.data, action: "delete" };
      const outcome = await services.writeContent(slug, examId, edit, requestId, viewer);
      return reply(200, { ...outcome, requestId });
    }
    if (creatingQuestion || editingQuestion) {
      const body = await readCourseCommandBody(request, directQuestionSchema);
      if (!body?.success) return reply(422, { error: "INVALID_TRYOUT_QUESTION" });
      const outcome = await services.writeContent(slug, examId, {
        ...body.data, action: "save-question", targetId: creatingQuestion ? null : questionId,
      }, requestId, viewer);
      return reply(creatingQuestion ? 201 : 200, { ...outcome, requestId });
    }
    if (managingQuestions) {
      const body = await readCourseCommandBody(request, questionSetSchema);
      if (!body?.success) return reply(422, { error: "INVALID_TRYOUT_QUESTIONS" });
      const outcome = await services.changeQuestions(slug, examId, body.data, requestId, viewer);
      return reply(200, { ...outcome, requestId });
    }
    const target = creating ? null : examId;
    if (creatingMetadata || editingMetadata) {
      const body = await readCourseCommandBody(request, metadataSchema);
      if (!body?.success || creating !== (body.data.expectedRevision === null) || tryoutDraftValidationError(body.data)) {
        return reply(422, { error: "INVALID_TRYOUT_METADATA" });
      }
      const outcome = await services.saveMetadata(slug, target, normalizeDates(body.data), requestId, viewer);
      return reply(creating ? 201 : 200, { ...outcome, requestId });
    }

    const body = await readCourseCommandBody(request, draftSchema);
    if (!body?.success || creating !== (body.data.expectedRevision === null) || tryoutDraftValidationError(body.data)) {
      return reply(422, { error: "INVALID_TRYOUT_DRAFT" });
    }
    const outcome = await services.save(slug, target, normalizeDates(body.data), requestId, viewer);
    return reply(creating ? 201 : 200, { ...outcome, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "COURSE_NOT_FOUND" || code === "TRYOUT_NOT_FOUND" || code === "TRYOUT_QUESTION_NOT_FOUND") return reply(404, { error: code });
    if (code.startsWith("QUESTION_VISUAL_") || code === "INTERACTIVE_DOCUMENT_COUNT_LIMIT") return reply(422, { error: "INVALID_TRYOUT_QUESTION" });
    if (code === "TRYOUT_BANK_VISUAL_UNVERIFIED" || code === "QUESTION_ITB_PROVENANCE_INCOMPLETE") return reply(422, { error: "INVALID_TRYOUT_QUESTIONS" });
    if (code === "REQUEST_CONFLICT" || code === "REVISION_CONFLICT" || code === "TRYOUT_NOT_DRAFT" || code === "COURSE_CHANGED" ||
      code === "TRYOUT_BANK_CHANGED" || code === "TRYOUT_HAS_SUBMISSIONS") {
      return reply(409, { error: code });
    }
    return reply(500, { error: "SAVE_FAILED" });
  }
}
