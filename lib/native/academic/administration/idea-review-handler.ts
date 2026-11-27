import { z } from "zod";
import { ideaReviewNoteLimit, isIdeaReviewTarget, type IdeaReviewDraft, type IdeaReviewTarget } from "@/packages/academic/idea-item-review";
import type { NativeAdminViewer } from "./admin-transaction";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  read(slug: string, importId: string, ideaId: string, actorId: string): Promise<IdeaReviewTarget | null>;
  write(slug: string, importId: string, ideaId: string, draft: IdeaReviewDraft, requestId: string, viewer: NativeAdminViewer): Promise<void>;
};

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  expectedRevision: checksum, expectedReviewRevision: checksum,
  status: z.enum(["pending", "approved", "changes_requested"]),
  notes: z.string().trim().max(ideaReviewNoteLimit).refine((notes) => !notes.includes("\0")),
}).strict();
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export function isNativeIdeaReviewPath(parts: readonly string[]) {
  return parts.length === 6 && parts[0] === "bundle" && parts[1] === "idea" && parts[4] === "item";
}

export async function handleNativeIdeaReview(request: Request, parts: string[], origin: string, services: Services) {
  const [, , slug, importId, , ideaId] = parts;
  if (!isNativeIdeaReviewPath(parts) || !["GET", "PATCH"].includes(request.method)) return reply(404, { error: "NOT_FOUND" });
  if (![slug, importId, ideaId].every((id) => nativeAdminIdSchema.safeParse(id).success)) return reply(400, { error: "INVALID_PATH" });
  if (request.method === "PATCH") {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  }
  try {
    const viewer = await services.session();
    if (!viewer?.session.id || !viewer.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    if (request.method === "GET") {
      const target = await services.read(slug, importId, ideaId, viewer.user.id);
      if (!target) return reply(404, { error: "NOT_FOUND" });
      return isIdeaReviewTarget(target) ? reply(200, target) : reply(500, { error: "READ_FAILED" });
    }
    const requestId = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = schema.safeParse(await readNativeAdminJson(request));
    if (!body.success) return reply(422, { error: "IDEA_ITEM_REVIEW_INVALID" });
    await services.write(slug, importId, ideaId, body.data, requestId.data, viewer);
    return reply(200, { requestId: requestId.data, importId, ideaId, status: body.data.status });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN" || code.endsWith("_FORBIDDEN")) return reply(403, { error: code });
    if (code.endsWith("_NOT_FOUND")) return reply(404, { error: "NOT_FOUND" });
    if (/_(?:CONFLICT|STALE_CONTEXT|CHECKSUM_MISMATCH|IMMUTABLE|DRAFT_REQUIRED)$/.test(code)) return reply(409, { error: code });
    return reply(500, { error: request.method === "GET" ? "READ_FAILED" : "SAVE_FAILED" });
  }
}
