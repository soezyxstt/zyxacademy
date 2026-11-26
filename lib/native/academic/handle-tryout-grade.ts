import type { TryoutGradeCommand, TryoutGradeReceipt } from "@/packages/academic/tryout-grade";
import { QuizTemplateWriteError } from "@/lib/asesmen/quiz-template-write";
import { TUTOR_CAPABILITY_ERRORS as errors } from "@/lib/tutor/assessment-policy";
import { quizGradingRequestIdSchema } from "@/lib/tutor/quiz-grading-contract";
import { registeredTryoutGradeInput, TRYOUT_GRADE_REQUEST_CONFLICT } from "@/lib/tutor/tryout-grading-contract";
import { readTutorCommandBody } from "./handle-tutor-support";

type Services = {
  session(): Promise<{ user: { id: string }; session?: { id: string } } | null>;
  hasTutor(userId: string): Promise<boolean>;
  grade(input: TryoutGradeCommand & { courseId: string; submissionId: string }, actor: {
    id: string; native: { sessionId: string; requestId: string };
  }): Promise<{ reviewRevision: string }>;
};

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleTryoutGrade(request: Request, parts: string[], expectedOrigin: string, services: Services) {
  const [section, courseId, action, submissionId] = parts;
  if (parts.length !== 4 || section !== "courses" || action !== "grading") return reply(404, { error: "NOT_FOUND" });
  if ([courseId, submissionId].some((id) => !id || id.length > 256 || /[\s/\\\u0000-\u001f]/.test(id))) {
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
    if (!session?.user.id || !session.session?.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasTutor(session.user.id))) return reply(403, { error: "FORBIDDEN" });
    const id = quizGradingRequestIdSchema.safeParse(request.headers.get("idempotency-key"));
    const body = registeredTryoutGradeInput.safeParse(await readTutorCommandBody(request));
    if (!id.success || !body.success) return reply(400, { error: "INVALID_INPUT" });
    const { reviewRevision } = await services.grade({ ...body.data, courseId, submissionId }, {
      id: session.user.id, native: { sessionId: session.session.id, requestId: id.data },
    });
    return reply(200, { requestId: id.data, submissionId, reviewRevision } satisfies TryoutGradeReceipt);
  } catch (error) {
    if (error instanceof QuizTemplateWriteError) return reply(error.status, { error: error.code });
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith(errors.ACCESS_DENIED) || code === errors.GRADING_COURSE_MISMATCH) {
      return reply(403, { error: "FORBIDDEN" });
    }
    if (code === errors.SUBMISSION_NOT_FOUND || code === errors.GRADING_NON_TRYOUT_FORBIDDEN) return reply(404, { error: "NOT_FOUND" });
    if (code === errors.GRADING_NOT_REVIEWABLE || code === errors.GRADING_CONCURRENT_CONFLICT || code === TRYOUT_GRADE_REQUEST_CONFLICT) {
      return reply(409, { error: "GRADING_CONFLICT" });
    }
    return reply(500, { error: "GRADING_FAILED" });
  }
}
