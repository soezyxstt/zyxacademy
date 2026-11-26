import { z } from "zod";
import { allowedCategories } from "../../../packages/academic/course-categories";
import type { AdminCourseEditDraft } from "../../../packages/native-parity/academic/courses/edit-contract";

type Viewer = { user: { id: string }; session: { id: string } };
type Services = {
  session(): Promise<Viewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  update(slug: string, draft: AdminCourseEditDraft, requestId: string, viewer: Viewer): Promise<void>;
};

const bodySchema = z.object({
  title: z.string().trim().min(1).max(500),
  category: z.enum([...allowedCategories, "Umum"]),
  description: z.string().trim().max(20_000).nullable(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function reply(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const decoder = new TextDecoder();
    let count = 0;
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return bodySchema.safeParse(JSON.parse(text + decoder.decode()));
      count += chunk.value.byteLength;
      if (count > 128 * 1024) {
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

export async function handleAdminCourseSettingsCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section] = parts;
  if (parts.length !== 4 || role !== "admin" || collection !== "courses" || section !== "settings") {
    return reply(404, { error: "NOT_FOUND" });
  }
  if (!slug.trim() || slug.length > 256 || /[/\\\u0000-\u001f]/u.test(slug)) return reply(400, { error: "INVALID_PATH" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await readBody(request);
    if (!body?.success) return reply(422, { error: "INVALID_COURSE" });
    await services.update(slug, body.data, requestId, viewer);
    return reply(200, { status: "saved", requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "COURSE_NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
    if (code === "REVISION_CONFLICT" || code === "REQUEST_CONFLICT") return reply(409, { error: code });
    if (code === "COURSE_PROJECTION_UNAVAILABLE") return reply(422, { error: "INVALID_COURSE" });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
