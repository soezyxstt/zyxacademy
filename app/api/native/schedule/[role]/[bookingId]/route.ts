import { z } from "zod";
import { GET as getStoredFile } from "@/app/api/storage/file/[...key]/route";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { readCourseCommandBody } from "@/lib/native/academic/course-command";
import { readScheduleMultipart } from "@/lib/native/schedule/resource-file";
import {
  readScheduleBooking, saveScheduleAttachment, scheduleDownload, scheduleResourceList, scheduleResources, updateScheduleResources,
} from "@/lib/native/schedule/resources";
import { scheduleUploadMime } from "@/lib/schedule/attachment-upload";
import { SCHEDULE_ACCOUNT, SCHEDULE_SESSION, scheduleFilePolicy, validScheduleId } from "@/packages/native-parity/schedule/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ role: string; bookingId: string }> };
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});
const fail = (status: number) => reply({ error: "schedule-resource-unavailable" }, status);

const commands = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("link"), kind: z.enum(["link", "recording"]), label: z.string().trim().min(1).max(160), url: z.string().trim().max(2048) }),
  z.strictObject({ action: z.literal("delete"), id: z.string().refine(validScheduleId) }),
  z.strictObject({ action: z.literal("summary"), notes: z.string().trim().min(1).max(10000) }),
]);

async function authorize(request: Request, context: Context) {
  if (!isSameOriginAdminRequest(request)) return fail(403);
  const { role, bookingId } = await context.params;
  if ((role !== "tutor" && role !== "murid") || !validScheduleId(bookingId)) return fail(404);
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session?.user?.id || !session.session?.id) return fail(401);
  const { id: userId } = session.user;
  const { id: sessionId } = session.session;
  if (request.headers.get(SCHEDULE_ACCOUNT) !== userId || request.headers.get(SCHEDULE_SESSION) !== sessionId) return fail(409);
  if (!(await hasPeran(userId, role))) return fail(403);
  const viewer = { userId, sessionId, role } as const;
  const access = await readScheduleBooking(viewer, bookingId);
  return access ? { viewer, access, bookingId } : fail(404);
}

export async function GET(request: Request, context: Context) {
  try {
    const scope = await authorize(request, context);
    if (scope instanceof Response) return scope;
    const resources = await scheduleResources(scope.viewer, scope.access);
    const id = new URL(request.url).searchParams.get("download");
    if (id === null) return reply(scheduleResourceList(scope.viewer, scope.access, resources));
    const key = validScheduleId(id) ? scheduleDownload(scope.access, resources, id) : null;
    if (!key) return fail(404);

    const target = new URL("/api/storage/file/" + key.split("/").map(encodeURIComponent).join("/"), request.url);
    target.searchParams.set("download", "1");
    // The canonical proxy checks the stored reference, course access and MIME again before streaming.
    const response = await getStoredFile(new Request(target, { headers: request.headers, signal: request.signal }), {
      params: Promise.resolve({ key: key.split("/") }),
    });
    if (response.status === 200) {
      const type = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      const size = Number(response.headers.get("Content-Length"));
      if (scheduleFilePolicy.mimeTypes.some(mime => mime === type) && Number.isSafeInteger(size) && size > 0 && size <= scheduleFilePolicy.maxBytes) return response;
      await response.body?.cancel();
      return fail(404);
    }
    await response.body?.cancel();
    return fail(response.status === 404 ? 404 : 503);
  } catch { return fail(503); }
}

export async function POST(request: Request, context: Context) {
  try {
    const scope = await authorize(request, context);
    if (scope instanceof Response) return scope;
    if (!scope.access.canWrite) return fail(403);
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType === "application/json") {
      const command = await readCourseCommandBody(request, commands, 64 * 1024);
      if (!command?.success) return fail(400);
      const result = await updateScheduleResources(scope.viewer, scope.access, command.data);
      return result ? reply(result) : fail(409);
    }
    const form = await readScheduleMultipart(request);
    if (typeof form === "number") return fail(form);
    const file = form.get("file");
    const requestKey = form.get("requestId");
    if (form.getAll("file").length !== 1 || form.getAll("requestId").length !== 1 ||
      !(file instanceof File) || !file.size || file.name.length > 180 ||
      typeof requestKey !== "string" || !z.uuid().safeParse(requestKey).success) return fail(400);
    if (file.size > scheduleFilePolicy.maxBytes) return fail(413);
    const mime = scheduleUploadMime(file);
    if (!mime) return fail(415);
    const result = await saveScheduleAttachment(scope.viewer, scope.bookingId, requestKey, file, mime);
    return result.status === 200 ? reply({ id: result.id }) : fail(result.status);
  } catch { return fail(503); }
}
