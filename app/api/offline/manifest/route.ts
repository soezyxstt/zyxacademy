import { offlineError, offlineHeaders, requireOfflineActor, OfflineHttpError } from "@/lib/offline/server-auth";
import { buildOfflineManifest } from "@/lib/offline/server-resources";
import { offlineLocaleSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const courseId = params.get("courseId");
    const locale = offlineLocaleSchema.safeParse(params.get("locale") ?? "id");
    if (!courseId || courseId.length > 256 || !locale.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const actor = await requireOfflineActor(request, locale.data);
    return Response.json(await buildOfflineManifest(actor, courseId), { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
