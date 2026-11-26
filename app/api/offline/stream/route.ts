import { offlineError, offlineHeaders, requireOfflineActor, assertOfflineActorCurrent, OfflineHttpError } from "@/lib/offline/server-auth";
import { readOfflineChanges } from "@/lib/offline/server-events";
import { offlineEnrollments } from "@/lib/offline/server-resources";
import { resolveCourseAccessBatch } from "@/lib/student/course-access";
import { OFFLINE_SYNC_COURSE_LIMIT, offlineCursorSchema, offlineLocaleSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Short-lived stream; clients still reconcile the durable log after every reconnect. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const locale = offlineLocaleSchema.safeParse(params.get("locale") ?? "id");
    const cursor = offlineCursorSchema.safeParse(params.get("cursor") ?? "0");
    if (!locale.success || !cursor.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const actor = await requireOfflineActor(request, locale.data);
    const enrollments = await offlineEnrollments(actor);
    const requested = [...new Set([...params.getAll("courseId").filter(id => id.length > 0 && id.length <= 256).slice(0, OFFLINE_SYNC_COURSE_LIMIT), ...enrollments.summaries.map(course => course.id)])].slice(0, OFFLINE_SYNC_COURSE_LIMIT);
    const access = await resolveCourseAccessBatch(actor.accountId, requested);
    const scopes = [...new Set([...access.values()].flatMap(grant => grant.hasCourseAccess ? [grant.courseId, grant.requestedCourseId, grant.canonicalCourseId, grant.legacyCourseId].filter((id): id is string => Boolean(id)) : []))];
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    const stop = () => { stopped = true; if (timer) clearTimeout(timer); wake?.(); };
    request.signal.addEventListener("abort", stop, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let last = cursor.data;
        const deadline = Date.now() + 45_000;
        try {
          controller.enqueue(encoder.encode("retry: 10000\n\n"));
          while (!stopped && Date.now() < deadline) {
            await assertOfflineActorCurrent(actor);
            const changes = await readOfflineChanges(actor.accountId, scopes, last, undefined, requested);
            if (changes.reset || changes.changes.length) controller.enqueue(encoder.encode(`event: hint\ndata: ${JSON.stringify({ cursor: changes.cursor })}\n\n`));
            else controller.enqueue(encoder.encode(": keepalive\n\n"));
            last = changes.cursor;
            if (changes.hasMore) continue;
            await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, 10_000); });
          }
        } catch (error) {
          if (!stopped && error instanceof OfflineHttpError && (error.status === 401 || error.status === 403)) {
            try { controller.enqueue(encoder.encode("event: hint\ndata: {}\n\n")); } catch { /* Client already disconnected. */ }
          }
        }
        finally { stop(); request.signal.removeEventListener("abort", stop); try { controller.close(); } catch { /* Already cancelled. */ } }
      },
      cancel: stop,
    });
    const headers = offlineHeaders(actor);
    headers.set("Content-Type", "text/event-stream");
    headers.set("X-Accel-Buffering", "no");
    return new Response(stream, { headers });
  } catch (error) { return offlineError(error); }
}
