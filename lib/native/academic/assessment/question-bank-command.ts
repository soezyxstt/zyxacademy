import { z } from "zod";
import { questionBankInputSchema, type QuestionBankFields } from "@/lib/tutor/question-bank-write";
import { questionValidationError } from "@/packages/native-parity/academic/assessment/model";
import { courseCommandReply, readCourseCommandBody, validCourseCommandId, type CourseCommandViewer } from "../course-command";

export type TutorBankWrite = { courseId: string } & (
  | { kind: "create"; input: QuestionBankFields }
  | { kind: "update"; id: string; expectedRevision: string; input: QuestionBankFields }
  | { kind: "delete"; id: string; expectedRevision: string }
);

const course = { courseId: z.string().refine(validCourseCommandId) };
const revision = { expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) };
const payload = questionBankInputSchema.refine(input => !questionValidationError({
  ...input, type: input.questionType, acceptableAnswers: input.acceptableAnswers ?? [],
}) && new Set(input.correctIndices).size === input.correctIndices.length);
const create = z.object({ ...course, input: payload }).strict();
const update = z.object({ ...course, ...revision, input: payload }).strict();
const remove = z.object({ ...course, ...revision }).strict();
const statusByError = new Map([
  ["UNAUTHENTICATED", 401], ["QUIZ_WRITER_FORBIDDEN", 403], ["HISTORICAL_QUESTION_IMMUTABLE", 403],
  ["QUESTION_BANK_NOT_FOUND", 404], ["QUESTION_BANK_WRONG_COURSE", 404],
  ["COURSE_CHANGED", 409], ["REVISION_CONFLICT", 409], ["REQUEST_CONFLICT", 409],
]);

type Services = {
  session(): Promise<CourseCommandViewer | null>;
  write(course: string, command: TutorBankWrite, requestId: string, viewer: CourseCommandViewer):
    Promise<{ questionId: string; revision: string | null }>;
};

export async function handleTutorQuestionBankCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, courseId, section, id] = parts;
  const method = request.method;
  const creating = method === "POST" && parts.length === 3;
  const editing = (method === "PATCH" || method === "DELETE") && parts.length === 4;
  const reply = courseCommandReply;
  if (role !== "tutor" || section !== "bank" || (!creating && !editing)) return reply(404, { error: "NOT_FOUND" });
  if (!validCourseCommandId(courseId) || (editing && !validCourseCommandId(id))) return reply(400, { error: "INVALID_PATH" });
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    let command: TutorBankWrite;
    if (creating) {
      const parsed = await readCourseCommandBody(request, create);
      if (!parsed?.success) return reply(422, { error: "INVALID_BANK_QUESTION" });
      command = { kind: "create", ...parsed.data };
    } else if (method === "PATCH") {
      const parsed = await readCourseCommandBody(request, update);
      if (!parsed?.success) return reply(422, { error: "INVALID_BANK_QUESTION" });
      command = { kind: "update", id, ...parsed.data };
    } else {
      const parsed = await readCourseCommandBody(request, remove);
      if (!parsed?.success) return reply(422, { error: "INVALID_BANK_QUESTION" });
      command = { kind: "delete", id, ...parsed.data };
    }
    const result = await services.write(courseId, command, requestId, viewer);
    return reply(creating ? 201 : 200, { ...result, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("QUESTION_VISUAL_") || code === "INTERACTIVE_DOCUMENT_COUNT_LIMIT") {
      return reply(422, { error: "BANK_QUESTION_VISUAL_UNSUPPORTED" });
    }
    const status = statusByError.get(code);
    return status ? reply(status, { error: code === "QUESTION_BANK_WRONG_COURSE" ? "QUESTION_BANK_NOT_FOUND" : code })
      : reply(500, { error: "SAVE_FAILED" });
  }
}
