import "server-only";

import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasPeran } from "@/lib/auth/request-cache";

/** Match the authenticated Admin shell, including first-use legacy provisioning. */
export async function getNativeOperationsAdmin() {
  const session = await getAuthSession();
  if (!session?.user?.id) return { ok: false, status: 401 } as const;
  await ensureLegacyIdentity(session.user.id);
  if (!(await hasPeran(session.user.id, "admin"))) return { ok: false, status: 403 } as const;
  return { ok: true, user: session.user } as const;
}
