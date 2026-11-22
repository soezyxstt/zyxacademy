import "server-only";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getPeranCodes } from "@/lib/auth/request-cache";
import {
  resolveRoleDashboardPath,
  type RoleDashboardPath,
} from "@/lib/auth/dashboard-entry";

export async function resolveUserDashboardPath(
  userId: string,
): Promise<RoleDashboardPath> {
  await ensureLegacyIdentity(userId);
  const roles = await getPeranCodes(userId);
  return resolveRoleDashboardPath(roles);
}
