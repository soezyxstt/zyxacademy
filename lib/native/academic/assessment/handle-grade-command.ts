import { z } from "zod";
import { TUTOR_QUIZ_GRADING_ERRORS, gradeAnswerItemSchema, quizGradingRequestIdSchema } from "../../../tutor/quiz-grading-contract";
import type { GradeQuizAttemptInput, GradeQuizRequest } from "../../../tutor/quiz-grading-contract";

type Services = {
  session(): Promise<{ user: { id: string } } | null>;
  isTutor(userId: string): Promise<boolean>;
  grade(input: GradeQuizAttemptInput, request: GradeQuizRequest): Promise<{ gradingStatus: "pending" | "graded" }>;
};

const requestBody = z.object({ items: z.array(gradeAnswerItemSchema).min(1), finalize: z.boolean() }).strict();
const maxBodyBytes = 2 * 1024 * 1024;

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function parseBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) return { status: 413 } as const;
  if (!request.body) return { status: 400 } as const;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return { status: 413 } as const;
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = requestBody.safeParse(JSON.parse(text + decoder.decode()));
    return body.success ? { data: body.data } as const : { status: 400 } as const;
  } catch {
    return { status: 400 } as const;
  } finally {
    reader.releaseLock();
  }
}

export async function handleGradeCommand(request: Request, parts: string[], expectedOrigin: string, services: Services) {
  const [role, courseId, operation, attemptId] = parts;
  if (parts.length !== 4 || role !== "tutor" || operation !== "grading") return reply(404, { error: "NOT_FOUND" });
  if ([courseId, attemptId].some((part) => !part.trim() || part.length > 256 || /[/\\\u0000-\u001f]/.test(part))) {
    return reply(400, { error: "INVALID_PATH" });
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== expectedOrigin || (fetchSite && fetchSite !== "same-origin")) {
    return reply(403, { error: "INVALID_ORIGIN" });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply(415, { error: "INVALID_CONTENT_TYPE" });
  }

  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.isTutor(session.user.id))) return reply(403, { error: "FORBIDDEN" });
    // Idempotency-Key is scoped to the authenticated Tutor and this exact course/attempt path.
    const requestId = quizGradingRequestIdSchema.safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await parseBody(request);
    if ("status" in body) return reply(body.status ?? 400, { error: "INVALID_GRADES" });
    const result = await services.grade({ courseId, attemptId, items: body.data.items }, {
      requestId: requestId.data, requireAllEssays: body.data.finalize,
    });
    return reply(200, { requestId: requestId.data, attemptId, gradingStatus: result.gradingStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Unauthorized")) return reply(401, { error: "UNAUTHENTICATED" });
    if (message.startsWith("TUTOR_ACCESS_DENIED") || message === "QUESTION_EXPOSURE_COURSE_ACCESS_DENIED" ||
        message === TUTOR_QUIZ_GRADING_ERRORS.COURSE_MISMATCH) return reply(403, { error: "FORBIDDEN" });
    if (message === TUTOR_QUIZ_GRADING_ERRORS.ATTEMPT_NOT_FOUND || message === TUTOR_QUIZ_GRADING_ERRORS.TEMPLATE_NOT_FOUND) {
      return reply(404, { error: "NOT_FOUND" });
    }
    if (message === TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT || message === TUTOR_QUIZ_GRADING_ERRORS.REQUEST_CONFLICT) {
      return reply(409, { error: "CONFLICT" });
    }
    if (message.startsWith("Validasi gagal:") || message === TUTOR_QUIZ_GRADING_ERRORS.ESSAY_REVIEW_REQUIRED ||
        message === TUTOR_QUIZ_GRADING_ERRORS.OBJECTIVE_OVERRIDE_FORBIDDEN ||
        message === TUTOR_QUIZ_GRADING_ERRORS.QUESTION_NOT_IN_ATTEMPT) return reply(422, { error: "INVALID_GRADES" });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
