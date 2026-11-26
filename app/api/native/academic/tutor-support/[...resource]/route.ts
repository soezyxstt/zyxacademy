import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleTryoutGrade } from "@/lib/native/academic/handle-tryout-grade";
import { handleTutorDiscussionAnswer, handleTutorSupport } from "@/lib/native/academic/handle-tutor-support";
import { tutorSupportServices } from "@/lib/native/academic/tutor-support-services";
import { gradeTryoutSubmission } from "@/lib/tutor/tryout-grading";

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleTutorSupport(new URL(request.url), (await context.params).resource, tutorSupportServices);
}

export async function POST(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[0] === "courses" && resource[2] === "grading") {
    return handleTryoutGrade(request, resource, origin, {
      session: tutorSupportServices.session,
      hasTutor: tutorSupportServices.hasTutor,
      grade: (input, actor) => gradeTryoutSubmission(actor, input),
    });
  }
  return handleTutorDiscussionAnswer(request, resource, origin, tutorSupportServices);
}
