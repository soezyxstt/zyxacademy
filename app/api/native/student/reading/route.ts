import { z } from "zod";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { offlineAssetFetchTarget, readBoundedOfflineAsset } from "@/lib/offline/server-assets";
import { loadNativePublishedReading } from "@/lib/student/native-published-reading";
import { requireNativeStudent } from "../_session";

export const runtime = "nodejs";
const resource = z.string().min(1).max(160).regex(/^[^/?#\\\s\u0000-\u001f\u007f]+$/u);
const query = z.object({
  courseId: resource,
  materialId: resource,
  asset: z.string().min(1).max(4096).optional(),
  revision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(value => Boolean(value.asset) === Boolean(value.revision));
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function failure(status: number) {
  return Response.json({ error: "READING_UNAVAILABLE" }, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const values = Object.fromEntries(params);
  const validated = query.safeParse(values);
  if (!validated.success || params.size !== Object.keys(values).length) return failure(400);
  const target = validated.data;
  try {
    const origin = new URL(resolveAuthBaseUrl()).origin;
    const published = await loadNativePublishedReading(actor.userId, target, origin);
    if (!target.asset) {
      const body = JSON.stringify(published);
      const length = Buffer.byteLength(body);
      if (length > 10 * 1024 * 1024) return failure(413);
      const current = await requireNativeStudent(request);
      if (current instanceof Response) return current;
      return new Response(body, { headers: { ...privateHeaders, "Content-Type": "application/json", "Content-Length": String(length) } });
    }

    if (published.revision !== target.revision) return failure(409);
    if (!published.assets.includes(target.asset)) return failure(404);
    const asset = offlineAssetFetchTarget(target.asset, origin);
    const headers = new Headers({ Accept: "image/*" });
    const cookie = request.headers.get("cookie");
    if (asset.sendCookies && cookie) headers.set("Cookie", cookie);
    const upstream = await fetch(asset.url, { headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
    const bytes = await readBoundedOfflineAsset(upstream);
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    const verified = await loadNativePublishedReading(current.userId, target, origin);
    if (published.revision !== verified.revision || !verified.assets.includes(target.asset)) return failure(409);
    return new Response(bytes as unknown as BodyInit, { headers: {
      ...privateHeaders, "Content-Type": upstream.headers.get("Content-Type")!, "Content-Length": String(bytes.byteLength),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof OfflineHttpError) return failure(target.asset && error.status === 404 ? 409 : error.status);
    return failure(503);
  }
}
