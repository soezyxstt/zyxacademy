import { z } from "zod";
import { isValidPkaScheduleText, type PkaScheduleEdit } from "@/packages/academic/pka-schedule-edit";
import type { NativeAdminViewer } from "./admin-transaction";
import type { NativePkaScheduleResult } from "./pka-schedule-service";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  save(id: string, draft: PkaScheduleEdit, requestId: string, viewer: NativeAdminViewer): Promise<NativePkaScheduleResult>;
};

const schema = z.object({
  title: z.string().trim().refine(isValidPkaScheduleText),
  sessionAt: z.iso.datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value))),
  meetLink: z.string().trim().refine(isValidPkaScheduleText).nullable(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleNativePkaSchedule(request: Request, parts: string[], origin: string, services: Services) {
  const [section, id] = parts;
  if (section !== "sessions" || parts.length !== 2 || request.method !== "PATCH") return reply(404, { error: "NOT_FOUND" });
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
    const body = schema.safeParse(await readNativeAdminJson(request));
    if (!body.success) return reply(422, { error: "INVALID_SCHEDULE" });
    const result = await services.save(id, body.data, requestId.data, viewer);
    return reply(result.status === "conflict" ? 409 : 200, { ...result, id, requestId: requestId.data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "NOT_FOUND") return reply(404, { error: code });
    if (code === "REQUEST_CONFLICT") return reply(409, { error: code });
    if (code === "WEB_DELIVERY_REQUIRED") return reply(422, { error: code });
    if (code === "INVALID_SCHEDULE") return reply(422, { error: code });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
