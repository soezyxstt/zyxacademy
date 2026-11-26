import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";

function deny(status: number, code: string): Response {
  return Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Domain handlers must also authorize the requested resource and operation. */
export async function requireNativeStudent(request: Request): Promise<{ userId: string } | Response> {
  if (!isSameOriginAdminRequest(request)) return deny(403, "ORIGIN_DENIED");
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user?.id) return deny(401, "SESSION_EXPIRED");
  const userId = session.user.id;
  if (request.headers.get("x-student-id") !== userId) return deny(409, "ACCOUNT_CHANGED");
  await ensureLegacyIdentity(userId);
  if (!(await hasPeran(userId, "murid"))) return deny(403, "STUDENT_REQUIRED");
  return { userId };
}
