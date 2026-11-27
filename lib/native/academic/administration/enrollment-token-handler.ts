import { z } from "zod";
import { validateEnrollmentTokenIssue, type EnrollmentTokenWrite } from "../../../../packages/academic/enrollment-token-admin";
import type { NativeAdminViewer } from "./admin-transaction";
import type { EnrollmentTokenWriteResult } from "./enrollment-token-service";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  write(command: EnrollmentTokenWrite, requestId: string, viewer: NativeAdminViewer): Promise<EnrollmentTokenWriteResult>;
};
const issueSchema = z.object({
  courseIds: z.array(nativeAdminIdSchema).min(1).max(100),
  capacity: z.number().int().min(1).max(1000),
  totalQuotaSessions: z.number().int().min(0).max(100000),
  weeklyQuotaSessions: z.number().int().min(0).max(100000),
}).strict();
const revokeSchema = z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleEnrollmentTokenWrite(request: Request, parts: string[], origin: string, services: Services) {
  const [section, id] = parts;
  const issue = parts.length === 1 && request.method === "POST";
  const revoke = parts.length === 2 && request.method === "PATCH";
  if (section !== "tokens" || (!issue && !revoke)) return reply(404, { error: "NOT_FOUND" });
  if (revoke && !nativeAdminIdSchema.safeParse(id).success) return reply(400, { error: "INVALID_PATH" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || !/^[\w-]{16,100}$/.test(requestId)) return reply(400, { error: "INVALID_REQUEST_ID" });
    const body = await readNativeAdminJson(request);
    let command: EnrollmentTokenWrite;
    if (issue) {
      const parsed = issueSchema.safeParse(body);
      if (!parsed.success || validateEnrollmentTokenIssue(parsed.data)) return reply(422, { error: "INVALID_TOKEN" });
      command = { type: "issue", fields: parsed.data };
    } else {
      const parsed = revokeSchema.safeParse(body);
      if (!parsed.success) return reply(422, { error: "INVALID_TOKEN" });
      command = { type: "revoke", id, fields: parsed.data };
    }
    const result = await services.write(command, requestId, viewer);
    if (result.status === "conflict") return reply(409, result);
    return reply(200, { ...result, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "TOKEN_NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
    if (code === "REQUEST_CONFLICT") return reply(409, { error: code });
    if (code === "INVALID_TOKEN" || code === "INVALID_COURSE") return reply(422, { error: code });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
