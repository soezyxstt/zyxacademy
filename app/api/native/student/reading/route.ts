import { z } from "zod";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { offlineAssetFetchTarget, readBoundedOfflineAsset } from "@/lib/offline/server-assets";
import { loadNativePublishedReading } from "@/lib/student/native-published-reading";
import { readCourseCommandBody } from "@/lib/native/academic/course-command";
import { requireNativeStudent } from "../_session";

export const runtime = "nodejs";
const resource = z.string().min(1).max(160).regex(/^[^/?#\\\s\u0000-\u001f\u007f]+$/u);
const query = z.object({
  courseId: resource,
  materialId: resource,
  asset: z.string().min(1).max(4096).optional(),
  revision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(value => Boolean(value.asset) === Boolean(value.revision));
const termSelection = z.object({
  courseId: resource,
  materialId: resource,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  selection: z.string().trim().min(3).max(1200),
}).strict();
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


/** Deterministic term lookup for the compatibility reader, shared with the web popover. */
export async function POST(request: Request) {
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (request.headers.get("origin") !== origin) return failure(403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return failure(415);
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const parsed = await readCourseCommandBody(request, termSelection, 8192);
  if (!parsed?.success) return failure(400);
  const target = parsed.data;
  try {
    const reading = await loadNativePublishedReading(actor.userId, target, origin);
    if (reading.revision !== target.revision) return failure(409);
    if (reading.structured) return failure(404);
    const [{ buildCourseTermIndex }, { matchTerm }, { loadConceptPopover }] = await Promise.all([
      import("@/lib/term-index"), import("@/lib/term-match"), import("@/lib/student/learning-concept-popover"),
    ]);
    const match = matchTerm(await buildCourseTermIndex(target.courseId), target.selection);
    const concept = match ? await loadConceptPopover(actor.userId, target.courseId, match.conceptName) : null;
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    const verified = await loadNativePublishedReading(current.userId, target, origin);
    if (current.userId !== actor.userId || verified.revision !== target.revision || verified.structured) return failure(409);
    return Response.json({ concept }, { headers: privateHeaders });
  } catch (error) {
    return failure(error instanceof OfflineHttpError ? error.status : 503);
  }
}
