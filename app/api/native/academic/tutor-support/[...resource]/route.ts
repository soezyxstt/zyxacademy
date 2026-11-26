import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleTutorDiscussionAnswer, handleTutorSupport } from "@/lib/native/academic/handle-tutor-support";
import { tutorSupportServices } from "@/lib/native/academic/tutor-support-services";

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleTutorSupport(new URL(request.url), (await context.params).resource, tutorSupportServices);
}

export async function POST(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleTutorDiscussionAnswer(request, (await context.params).resource, new URL(resolveAuthBaseUrl()).origin, tutorSupportServices);
}
