import { gradeQuizAttemptAction } from "@/app/actions/tutor-quiz-grading";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAssessmentRead } from "@/lib/native/academic/assessment/handle-read";
import { handleGradeCommand } from "@/lib/native/academic/assessment/handle-grade-command";
import { assessmentReadServices } from "@/lib/native/academic/assessment/read-services";

import { handleAdminTryoutDraftCommand } from "@/lib/native/academic/assessment/tryout-draft-command";
import { saveTryoutDraftFromNative } from "@/lib/native/academic/assessment/tryout-draft-service";

function tryoutDraftCommand(request: Request, parts: string[], origin: string) {
  return handleAdminTryoutDraftCommand(request, parts, origin, {
    session: getAuthSession,
    hasAdmin: assessmentReadServices.isAdmin,
    save: saveTryoutDraftFromNative,
  });
}

type Context = { params: Promise<{ resource: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  return handleAssessmentRead((await params).resource, assessmentReadServices);
}

export async function POST(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[0] === "admin") return tryoutDraftCommand(request, resource, origin);
  return handleGradeCommand(request, resource, origin, {
    session: assessmentReadServices.session,
    isTutor: assessmentReadServices.isTutor,
    grade: gradeQuizAttemptAction,
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return tryoutDraftCommand(request, (await params).resource, new URL(resolveAuthBaseUrl()).origin);
}
