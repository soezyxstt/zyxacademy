import { z } from "zod";
import type { PkaLifecycleCommand, PkaLifecycleReceipt } from "@/packages/academic/pka-lifecycle";
import { isValidPkaScheduleText } from "@/packages/academic/pka-schedule-edit";
import type { NativeAdminViewer } from "./admin-transaction";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  write(command: PkaLifecycleCommand, requestId: string, viewer: NativeAdminViewer): Promise<PkaLifecycleReceipt>;
};

const expectedRevision = z.string().regex(/^[a-f0-9]{64}$/);
const commandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create-schedule"),
    title: z.string().trim().refine(isValidPkaScheduleText),
    sessionAt: z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value))),
    meetLink: z.url({ protocol: /^https$/ }).refine(isValidPkaScheduleText)
      .refine(value => {
        try { const url = new URL(value); return !url.username && !url.password; } catch { return false; }
      }).nullable(),
  }),
  z.strictObject({ action: z.literal("delete-schedule"), id: nativeAdminIdSchema, expectedRevision }),
  z.strictObject({
    action: z.literal("announcement-state"), id: nativeAdminIdSchema, expectedRevision,
    field: z.enum(["archived", "pinned"]), value: z.boolean(),
  }),
]);

const reply = (status: number, body: unknown) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function handleNativePkaLifecycle(request: Request, origin: string, services: Services) {
  if (request.method !== "POST") return reply(405, { error: "INVALID_METHOD" });
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasAdmin(viewer.user.id))) return reply(403, { error: "FORBIDDEN" });
    const requestId = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const command = commandSchema.safeParse(await readNativeAdminJson(request));
    if (!command.success) return reply(422, { error: "INVALID_PKA_COMMAND" });
    const result = await services.write(command.data, requestId.data, viewer);
    return reply(result.status === "saved" ? 200 : 409, { ...result, requestId: requestId.data });
  } catch (cause) {
    switch (cause instanceof Error ? cause.message : "") {
      case "UNAUTHENTICATED": return reply(401, { error: "UNAUTHENTICATED" });
      case "FORBIDDEN": return reply(403, { error: "FORBIDDEN" });
      case "NOT_FOUND": return reply(404, { error: "NOT_FOUND" });
      case "REQUEST_CONFLICT": return reply(409, { error: "REQUEST_CONFLICT" });
      case "WEB_DELIVERY_REQUIRED": return reply(422, { error: "WEB_DELIVERY_REQUIRED" });
      default: return reply(500, { error: "SAVE_FAILED" });
    }
  }
}
