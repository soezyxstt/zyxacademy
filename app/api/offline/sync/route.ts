import { offlineError, offlineHeaders, requireOfflineActor, requireOfflineSameOrigin } from "@/lib/offline/server-auth";
import { synchronizeOffline } from "@/lib/offline/server-sync";
import { offlineSyncRequestSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOfflineSameOrigin(request);
    const parsed = offlineSyncRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Permintaan tidak valid." }, { status: 400, headers: offlineHeaders() });
    const actor = await requireOfflineActor(request, parsed.data.locale);
    return Response.json(await synchronizeOffline(actor, parsed.data), { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
