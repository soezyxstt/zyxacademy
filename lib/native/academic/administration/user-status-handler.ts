import { z } from "zod";
import { adminUserStatuses, type AdminUserStatusEdit } from "../../../../packages/academic/admin-user-status";
import type { NativeAdminViewer } from "./admin-transaction";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";
import type { NativeUserStatusResult } from "./user-status-service";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  save(id: string, draft: AdminUserStatusEdit, requestId: string, viewer: NativeAdminViewer): Promise<NativeUserStatusResult>;
};

const bodySchema = z.object({
  accountId: nativeAdminIdSchema,
  status: z.enum(adminUserStatuses),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleNativeUserStatus(request: Request, parts: string[], origin: string, services: Services) {
  const [section, id, operation] = parts;
  if (section !== "users" || operation !== "status" || parts.length !== 3 || request.method !== "PATCH") return reply(404, { error: "NOT_FOUND" });
  if (!nativeAdminIdSchema.safeParse(id).success) return reply(400, { error: "INVALID_PATH" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = bodySchema.safeParse(await readNativeAdminJson(request));
    if (!body.success) return reply(422, { error: "INVALID_STATUS" });
    if (body.data.accountId !== viewer.user.id) return reply(403, { error: "FORBIDDEN" });
    const result = await services.save(id, body.data, requestId.data, viewer);
    return reply(result.status === "conflict" ? 409 : 200, { ...result, requestId: requestId.data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "USER_NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
    if (code === "USER_IDENTITY_UNAVAILABLE") return reply(422, { error: code });
    if (code === "REQUEST_CONFLICT") return reply(409, { error: code });
    if (code === "SELF_SUSPENSION") return reply(422, { error: code });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
