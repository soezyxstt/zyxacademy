import { db } from "@/db";
import { offlineError, offlineHeaders, requireOfflineActor, requireOfflineSameOrigin, OfflineHttpError } from "@/lib/offline/server-auth";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { offlineRevalidateSchema } from "@/lib/offline/sync-contract";
import { buildOfflineManifest } from "@/lib/offline/server-resources";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOfflineSameOrigin(request);
    const actor = await requireOfflineActor(request, "id", true);
    const parsed = offlineRevalidateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const input = parsed.data;
    if (input.courseId) {
      const manifest = await buildOfflineManifest(actor, input.courseId);
      if (input.scope === "resource" && !manifest.resources.some(resource => resource.id === input.resourceId && resource.kind === input.kind)) throw new OfflineHttpError(404, "OFFLINE_MATERIAL_UNAVAILABLE");
    } else if (input.scope === "resource" && input.kind !== "achievement_catalog" && input.kind !== "enrollments") throw new OfflineHttpError(400, "OFFLINE_COURSE_REQUIRED");
    const cursor = await db.transaction(async tx => {
      await assertAuthoringActor(tx, actor.accountId, { roles: ["admin"], lock: true, error: "OFFLINE_ADMIN_REQUIRED" });
      return recordOfflineChange(tx, { kind: input.scope === "resource" ? input.kind! : "course", courseId: input.scope === "all" ? null : input.courseId, resourceId: input.scope === "resource" ? input.resourceId : null, action: "invalidate" });
    });
    return Response.json({ cursor }, { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
