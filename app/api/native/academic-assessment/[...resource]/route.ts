import { gradeQuizAttemptAction } from "@/app/actions/tutor-quiz-grading";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireNativeQuizWriter } from "@/lib/asesmen/quiz-template-write";
import { getQuizAttemptDetailsForGrading } from "@/lib/tutor/quiz-grading";
import { handleAssessmentRead } from "@/lib/native/academic/assessment/handle-read";
import { handleGradeAttachment } from "@/lib/native/academic/assessment/grade-attachment";
import { handleGradeCommand } from "@/lib/native/academic/assessment/handle-grade-command";
import { assessmentReadServices } from "@/lib/native/academic/assessment/read-services";

import { handleAdminTryoutDraftCommand } from "@/lib/native/academic/assessment/tryout-draft-command";
import { changeTryoutDraftQuestionsFromNative, saveTryoutDraftFromNative, saveTryoutMetadataFromNative, writeNativeTryoutContent } from "@/lib/native/academic/assessment/tryout-draft-service";

import { handleTutorQuestionBankCommand } from "@/lib/native/academic/assessment/question-bank-command";
import { writeNativeTutorQuestionBank } from "@/lib/native/academic/assessment/question-bank-service";

function bankCommand(request: Request, resource: string[], origin: string) {
  return handleTutorQuestionBankCommand(request, resource, origin, { session: getAuthSession, write: writeNativeTutorQuestionBank });
}
const isBankWrite = (resource: string[]) => resource[0] === "tutor" && resource[2] === "bank";

function tryoutDraftCommand(request: Request, parts: string[], origin: string) {
  return handleAdminTryoutDraftCommand(request, parts, origin, {
    session: getAuthSession,
    hasAdmin: assessmentReadServices.isAdmin,
    save: saveTryoutDraftFromNative,
    saveMetadata: saveTryoutMetadataFromNative,
    writeContent: writeNativeTryoutContent,
    changeQuestions: changeTryoutDraftQuestionsFromNative,
  });
}

type Context = { params: Promise<{ resource: string[] }> };
export async function GET(request: Request, { params }: Context) {
  const { resource } = await params;
  if (resource[4] === "attachment") {
    return handleGradeAttachment(request, resource, {
      session: getAuthSession,
      async find(courseId, attemptId, questionId, viewer) {
        const completed = await db.transaction(async tx => {
          await requireNativeQuizWriter(tx, { actorId: viewer.user.id, sessionId: viewer.session.id, courseId, role: "tutor" });
          const [attempt] = await tx.select({ templateId: studentQuizAttempts.templateId }).from(studentQuizAttempts).where(and(
            eq(studentQuizAttempts.id, attemptId), eq(studentQuizAttempts.status, "completed"),
          )).limit(1).for("share");
          return attempt;
        });
        if (!completed) return null;
        const detail = await getQuizAttemptDetailsForGrading(courseId, attemptId, viewer.user.id);
        const key = detail?.questions.find(question => question.id === questionId)?.fileKey;
        return detail?.templateId === completed.templateId && key ? { templateId: detail.templateId, key } : null;
      },
      async download(fileRequest, key) {
        const { GET: serveStorage } = await import("@/app/api/storage/file/[...key]/route");
        return serveStorage(fileRequest, { params: Promise.resolve({ key }) });
      },
    });
  }
  return handleAssessmentRead(resource, assessmentReadServices);
}

export async function POST(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (isBankWrite(resource)) return bankCommand(request, resource, origin);
  if (resource[0] === "admin") return tryoutDraftCommand(request, resource, origin);
  return handleGradeCommand(request, resource, origin, {
    session: assessmentReadServices.session,
    isTutor: assessmentReadServices.isTutor,
    grade: gradeQuizAttemptAction,
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  return isBankWrite(resource) ? bankCommand(request, resource, origin) : tryoutDraftCommand(request, resource, origin);
}

export async function DELETE(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  return isBankWrite(resource) ? bankCommand(request, resource, origin) : tryoutDraftCommand(request, resource, origin);
}
