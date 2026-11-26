import { getAuthSession } from "@/lib/auth-session";
import { resolveRoleDashboardPath } from "@/lib/auth/dashboard-entry";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getPeranCodes } from "@/lib/auth/request-cache";
import { getAppLocale } from "@/lib/i18n/server";
import type { NativeAccountContext } from "@/packages/native-session/context";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return new Response(null, { status: 401, headers });
  await ensureLegacyIdentity(session.user.id);
  const roles = await getPeranCodes(session.user.id);
  if (!roles.length) return new Response(null, { status: 403, headers });
  const result: NativeAccountContext = {
    accountId: session.user.id,
    sessionId: session.session.id,
    roles,
    locale: await getAppLocale(),
    dashboard: resolveRoleDashboardPath(roles),
    display: { name: session.user.name, email: session.user.email },
  };
  return Response.json(result, { headers });
}
