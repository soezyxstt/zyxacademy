import { gradeQuizAttemptAction } from "@/app/actions/tutor-quiz-grading";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAssessmentRead } from "@/lib/native/academic/assessment/handle-read";
import { handleGradeCommand } from "@/lib/native/academic/assessment/handle-grade-command";
import { assessmentReadServices } from "@/lib/native/academic/assessment/read-services";

type Context = { params: Promise<{ resource: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  return handleAssessmentRead((await params).resource, assessmentReadServices);
}

export async function POST(request: Request, { params }: Context) {
  return handleGradeCommand(request, (await params).resource, new URL(resolveAuthBaseUrl()).origin, {
    session: assessmentReadServices.session,
    isTutor: assessmentReadServices.isTutor,
    grade: gradeQuizAttemptAction,
  });
}
