import type { ZodType } from "zod";

export type CourseCommandViewer = { user: { id: string }; session: { id: string } };
export type CourseCommandAuth = {
  session(): Promise<CourseCommandViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
};

export function courseCommandReply(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function validCourseCommandId(id: string) {
  return Boolean(id.trim() && id.length <= 256 && id !== "." && id !== ".." && !/[/\\\u0000-\u001f]/u.test(id));
}

export async function readCourseCommandBody<T>(request: Request, schema: ZodType<T>, maxBytes = 128 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const decoder = new TextDecoder();
    let count = 0;
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return schema.safeParse(JSON.parse(text + decoder.decode()));
      count += chunk.value.byteLength;
      if (count > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleCourseCommand<T>(request: Request, origin: string, auth: CourseCommandAuth, options: {
  schema: ZodType<T>;
  invalidError: "INVALID_COURSE" | "INVALID_CHAPTER" | "INVALID_MATERIAL";
  maxBodyBytes?: number;
  write(draft: T, requestId: string, viewer: CourseCommandViewer): Promise<void>;
}) {
  const reply = courseCommandReply;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await auth.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await auth.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await readCourseCommandBody(request, options.schema, options.maxBodyBytes);
    if (!body?.success) return reply(422, { error: options.invalidError });
    await options.write(body.data, requestId, viewer);
    return reply(200, { status: "saved", requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "COURSE_NOT_FOUND" || code === "CHAPTER_NOT_FOUND" || code === "MATERIAL_NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
    if (code === "COURSE_ALREADY_EXISTS" || code === "DEPENDENCIES_EXIST" || code === "REVISION_CONFLICT" || code === "REQUEST_CONFLICT" ||
      code === "COURSE_IDENTITY_AMBIGUOUS" || code === "CHAPTER_IDENTITY_AMBIGUOUS") return reply(409, { error: code });
    if (code === "COURSE_PROJECTION_UNAVAILABLE" || code === "CHAPTER_PROJECTION_UNAVAILABLE" ||
      code.startsWith("CHAPTER_ORDER_") || code.startsWith("INVALID_COURSE_PRICING")) {
      return reply(422, { error: options.invalidError });
    }
    return reply(500, { error: "SAVE_FAILED" });
  }
}
