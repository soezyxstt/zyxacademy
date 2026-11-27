import { createHash } from "node:crypto";
import { offlineError, offlineHeaders, requireOfflineActor, OfflineHttpError } from "@/lib/offline/server-auth";
import { buildOfflineResource, offlineAssetUrl } from "@/lib/offline/server-resources";
import { offlineAssetFetchTarget, readBoundedOfflineAsset } from "@/lib/offline/server-assets";
import { OFFLINE_HEADERS, offlineResourceRequestSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const source = query.get("asset");
    const revision = query.get("revision");
    query.delete("asset"); query.delete("revision");
    const parsed = offlineResourceRequestSchema.safeParse(Object.fromEntries(query));
    if (!parsed.success || !source || source.length > 4096 || !revision || !/^[a-f0-9]{64}$/.test(revision)) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const actor = await requireOfflineActor(request, parsed.data.locale);
    const resource = await buildOfflineResource(actor, parsed.data.kind, parsed.data.id, parsed.data.courseId);
    if (resource.resource.revision !== revision) throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
    const admitted = offlineAssetUrl(resource.resource, actor.locale, source);
    if (!resource.assets.some(asset => asset.url === admitted)) throw new OfflineHttpError(403, "OFFLINE_ASSET_NOT_ADMITTED");
    const target = offlineAssetFetchTarget(source, actor.environment);
    const upstreamHeaders = new Headers({ Accept: "image/*" });
    if (target.sendCookies && request.headers.get("cookie")) upstreamHeaders.set("Cookie", request.headers.get("cookie")!);
    const upstream = await fetch(target.url, { headers: upstreamHeaders, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const bytes = await readBoundedOfflineAsset(upstream);
    // Fetch may take seconds. Do not renew a lease after withdrawal or session revocation.
    const current = await buildOfflineResource(actor, parsed.data.kind, parsed.data.id, parsed.data.courseId);
    if (current.resource.revision !== revision || !current.assets.some(asset => asset.url === admitted)) throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
    const headers = offlineHeaders(actor);
    headers.set("Content-Type", upstream.headers.get("content-type")!);
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("ETag", `"${createHash("sha256").update(bytes).digest("hex")}"`);
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    headers.set(OFFLINE_HEADERS.leaseExpiresAt, String(Math.min(resource.leaseExpiresAt, current.leaseExpiresAt)));
    headers.set(OFFLINE_HEADERS.validatedAt, String(current.validatedAt));
    headers.set(OFFLINE_HEADERS.cursor, resource.cursor);
    headers.set(OFFLINE_HEADERS.revision, resource.resource.revision);
    return new Response(bytes as unknown as BodyInit, { headers });
  } catch (error) { return offlineError(error); }
}
