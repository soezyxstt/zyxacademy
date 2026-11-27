import { z } from "zod";
import {
  pkaAnnouncementBodyLimit, pkaAnnouncementTitleLimit, type PkaAnnouncementEdit,
} from "../../../../packages/academic/pka-announcement-edit";
import type { AnnouncementEditResult } from "./announcement-edit-transaction";

type Viewer = { user: { id: string }; session: { id: string } };
type Services = {
  session(): Promise<Viewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  update(id: string, draft: PkaAnnouncementEdit, requestId: string, viewer: Viewer): Promise<AnnouncementEditResult>;
};

const bodySchema = z.object({
  title: z.string().trim().min(1).max(pkaAnnouncementTitleLimit),
  body: z.string().trim().min(1).max(pkaAnnouncementBodyLimit),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return bodySchema.safeParse(JSON.parse(text + decoder.decode()));
      bytes += chunk.value.byteLength;
      if (bytes > 32 * 1024) {
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

function reply(status: number, value: unknown) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handlePkaAnnouncementEdit(request: Request, parts: string[], origin: string, services: Services) {
  const [section, id] = parts;
  if (section !== "announcements" || parts.length !== 2) return reply(404, { error: "NOT_FOUND" });
  if (!id.trim() || id.length > 256 || /[/\\\u0000-\u001f]/u.test(id)) return reply(400, { error: "INVALID_PATH" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await readBoundedBody(request);
    if (!body?.success) return reply(422, { error: "INVALID_ANNOUNCEMENT" });
    const result = await services.update(id, body.data, requestId, viewer);
    switch (result.status) {
      case "saved": return reply(200, { ...result, requestId });
      case "conflict": return reply(409, result);
      case "request_conflict": return reply(409, { error: "REQUEST_CONFLICT" });
      case "missing": return reply(404, { error: "NOT_FOUND" });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "REQUEST_CONFLICT") return reply(409, { error: code });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
