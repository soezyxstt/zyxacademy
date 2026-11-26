import { offlineError, offlineHeaders, requireOfflineActor, requireOfflineSameOrigin, OfflineHttpError } from "@/lib/offline/server-auth";
import { offlinePolicyStatus, readOfflinePolicy, writeOfflinePolicy } from "@/lib/offline/server-events";
import { offlinePolicyPatchSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireOfflineActor(request, "id", true);
    const [policy, status] = await Promise.all([readOfflinePolicy(), offlinePolicyStatus()]);
    return Response.json({ policy, revision: policy.revision, status }, { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
export async function PATCH(request: Request) {
  try {
    requireOfflineSameOrigin(request);
    const actor = await requireOfflineActor(request, "id", true);
    const parsed = offlinePolicyPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_POLICY");
    const policy = await writeOfflinePolicy(actor.accountId, parsed.data.expectedRevision, parsed.data.policy);
    return Response.json({ policy, revision: policy.revision, status: await offlinePolicyStatus() }, { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
