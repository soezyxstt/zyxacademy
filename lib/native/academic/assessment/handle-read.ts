import type {
  QuizAttempt, QuizAttemptsSheet, QuizAttemptSummary, QuizCollection, QuizPreviewQuestion, TryoutCollection,
} from "../../../../packages/native-parity/academic/assessment/model";

export type AssessmentReadScope = { role: "admin" | "tutor"; courseKey: string; actorId: string };

export interface AssessmentReadServices {
  session(): Promise<{ user: { id: string } } | null>;
  isAdmin(userId: string): Promise<boolean>;
  isTutor(userId: string): Promise<boolean>;
  quizzes(scope: AssessmentReadScope): Promise<QuizCollection | null>;
  preview(scope: AssessmentReadScope, quizId: string): Promise<QuizPreviewQuestion[] | null>;
  attempts(scope: AssessmentReadScope, quizId: string): Promise<QuizAttemptsSheet | null>;
  grading(scope: AssessmentReadScope): Promise<QuizAttemptSummary[] | null>;
  gradeDetails(scope: AssessmentReadScope, attemptId: string): Promise<QuizAttempt | null>;
  tryouts(scope: AssessmentReadScope): Promise<TryoutCollection | null>;
}

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleAssessmentRead(parts: string[], services: AssessmentReadServices) {
  if (parts.some((part) => !part.trim() || part.length > 256 || /[/\\\u0000-\u001f]/.test(part))) {
    return reply(400, { error: "INVALID_PATH" });
  }
  const [role, courseKey, operation, entityId] = parts;
  if (role !== "admin" && role !== "tutor") return reply(404, { error: "NOT_FOUND" });

  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    const actorId = session.user.id;
    const allowed = role === "admin" ? await services.isAdmin(actorId) : await services.isTutor(actorId);
    if (!allowed) return reply(403, { error: "FORBIDDEN" });
    const scope = { role, courseKey, actorId } as const;
    let result: unknown;
    if (operation === "quizzes" && parts.length === 3) result = await services.quizzes(scope);
    else if (operation === "preview" && parts.length === 4) result = await services.preview(scope, entityId);
    else if (operation === "attempts" && parts.length === 4) result = await services.attempts(scope, entityId);
    else if (operation === "grading" && role === "tutor" && parts.length === 3) result = await services.grading(scope);
    else if (operation === "grading" && role === "tutor" && parts.length === 4) result = await services.gradeDetails(scope, entityId);
    else if (operation === "tryouts" && role === "admin" && parts.length === 3) result = await services.tryouts(scope);
    if (result === null || result === undefined) return reply(404, { error: "NOT_FOUND" });
    return reply(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("TUTOR_ACCESS_DENIED") || message === "TUTOR_INACTIVE" ||
        message === "USER_NOT_FOUND" || message === "Forbidden, admin role required.") {
      return reply(403, { error: "FORBIDDEN" });
    }
    return reply(500, { error: "READ_FAILED" });
  }
}
