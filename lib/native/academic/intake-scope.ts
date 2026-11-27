import "server-only";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { auth } from "@/lib/auth";
import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { intakeAccountHeader, intakeCourseHeader, intakeSessionHeader } from "@/packages/native-parity/academic/courses/intake";

export function isNativeIntake(request: Request) {
  return [intakeAccountHeader, intakeSessionHeader, intakeCourseHeader].some(header => request.headers.has(header));
}

export async function requireNativeIntake(request: Request) {
  if (!isSameOriginAdminRequest(request)) return { response: intakeError(403, "FORBIDDEN") } as const;
  const current = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!current?.user.id || !current.session.id || new Date(current.session.expiresAt).getTime() <= Date.now()) {
    return { response: intakeError(401, "UNAUTHENTICATED") } as const;
  }
  const accountId = request.headers.get(intakeAccountHeader);
  const sessionId = request.headers.get(intakeSessionHeader);
  if (accountId !== current.user.id || sessionId !== current.session.id || !(await hasAuthoringActor(accountId, ["admin"]))) {
    return { response: intakeError(403, "FORBIDDEN") } as const;
  }
  const id = request.headers.get(intakeCourseHeader);
  const identity = id && id.length <= 160 ? await resolveCourseIdentity(id) : null;
  if (!identity || id !== identity.primaryId || identity.status !== "active") {
    return { response: intakeError(404, "COURSE_NOT_FOUND") } as const;
  }
  return { scope: { accountId, sessionId, courseId: identity.primaryId }, identity } as const;
}

export function intakeError(status: number, error: string) {
  return intakeJson({ error }, status);
}

export function intakeJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
