import { offlineError, offlineHeaders, requireOfflineActor, OfflineHttpError } from "@/lib/offline/server-auth";
import { buildOfflineResource, offlineUnchangedMaterial } from "@/lib/offline/server-resources";
import { OFFLINE_HEADERS, offlineResourceRequestSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const parsed = offlineResourceRequestSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const actor = await requireOfflineActor(request, parsed.data.locale);
    const unchanged = await offlineUnchangedMaterial(actor, parsed.data.kind, parsed.data.id, parsed.data.courseId, request.headers.get("if-none-match"));
    const resource = unchanged ?? await buildOfflineResource(actor, parsed.data.kind, parsed.data.id, parsed.data.courseId);
    const headers = offlineHeaders(actor);
    const etag = `"${resource.resource.revision}"`;
    headers.set("ETag", etag);
    headers.set(OFFLINE_HEADERS.leaseExpiresAt, String(resource.leaseExpiresAt));
    headers.set(OFFLINE_HEADERS.validatedAt, String(resource.validatedAt));
    headers.set(OFFLINE_HEADERS.cursor, resource.cursor);
    headers.set(OFFLINE_HEADERS.revision, resource.resource.revision);
    // Authorization and publication checks always run before a 304 response.
    if (unchanged || request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json(resource, { headers });
  } catch (error) { return offlineError(error); }
}
