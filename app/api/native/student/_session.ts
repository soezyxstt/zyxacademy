import { auth } from "@/lib/auth";
import { getPeranCodes } from "@/lib/auth/authorization";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { personalAccountSessionHeader } from "@/packages/student-community/account-access";

function deny(status: number, code: string): Response {
  return Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Domain handlers must also authorize the requested resource and operation. */
async function requireActor(request: Request, personalAccount: boolean): Promise<{ userId: string } | Response> {
  if (!isSameOriginAdminRequest(request)) return deny(403, "ORIGIN_DENIED");
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user?.id) return deny(401, "SESSION_EXPIRED");
  const userId = session.user.id;
  if (request.headers.get("x-student-id") !== userId) return deny(409, "ACCOUNT_CHANGED");
  await ensureLegacyIdentity(userId);
  const roles = await getPeranCodes(userId);
  if (!personalAccount) return roles.includes("murid") ? { userId } : deny(403, "STUDENT_REQUIRED");
  if (!roles.length) return deny(403, "ACCOUNT_ACCESS_DENIED");
  const expectedSession = request.headers.get(personalAccountSessionHeader);
  // Existing learner clients supply only the account ID. Staff entry requires both.
  if ((expectedSession !== null || !roles.includes("murid")) && expectedSession !== session.session.id) {
    return deny(409, "SESSION_CHANGED");
  }
  return { userId };
}

export const requireNativeStudent = (request: Request) => requireActor(request, false);
export const requireNativePersonalAccount = (request: Request) => requireActor(request, true);
