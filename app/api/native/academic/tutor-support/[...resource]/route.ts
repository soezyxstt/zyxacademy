import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleTryoutGrade } from "@/lib/native/academic/handle-tryout-grade";
import { handleTutorSlotWrite } from "@/lib/native/academic/handle-tutor-slot";
import { handleTutorDiscussionAnswer, handleTutorSupport } from "@/lib/native/academic/handle-tutor-support";
import { tutorSupportServices } from "@/lib/native/academic/tutor-support-services";
import { saveTutorSlot } from "@/lib/native/academic/tutor-slot-service";
import { gradeTryoutSubmission } from "@/lib/tutor/tryout-grading";

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleTutorSupport(new URL(request.url), (await context.params).resource, tutorSupportServices);
}

function writeSlot(request: Request, parts: string[]) {
  return handleTutorSlotWrite(request, parts, new URL(resolveAuthBaseUrl()).origin, {
    session: tutorSupportServices.session, hasTutor: tutorSupportServices.hasTutor, save: saveTutorSlot,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return writeSlot(request, (await context.params).resource);
}

export async function POST(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  if (resource[0] === "schedule") return writeSlot(request, resource);
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
