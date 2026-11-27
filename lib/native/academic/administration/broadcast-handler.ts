import { z } from "zod";
import { getSafeRedirectPath } from "../../../auth-redirect";
import {
  broadcastBodyLimit, broadcastLinkLimit, broadcastTargets, broadcastTitleLimit,
  type BroadcastComposeData, type BroadcastDraft, type BroadcastReceipt,
} from "../../../../packages/academic/admin-broadcast";
import type { NativeAdminViewer } from "./admin-transaction";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";

type Services = {
  session(): Promise<NativeAdminViewer | null>;
  read(viewer: NativeAdminViewer): Promise<BroadcastComposeData>;
  prepare(viewer: NativeAdminViewer, id: string, draft: BroadcastDraft): Promise<BroadcastReceipt>;
  transition(viewer: NativeAdminViewer, id: string, action: "confirm" | "discard"): Promise<BroadcastReceipt>;
};

const draftSchema = z.object({
  title: z.string().trim().min(1).max(broadcastTitleLimit),
  body: z.string().trim().min(1).max(broadcastBodyLimit),
  link: z.string().trim().max(broadcastLinkLimit).refine(link => !link || getSafeRedirectPath(link) === link),
  target: z.enum(broadcastTargets),
  targetId: z.union([z.literal(""), nativeAdminIdSchema]),
}).strict().refine(({ target, targetId }) => (target === "all") === (targetId === ""));
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), draft: draftSchema }).strict(),
  z.object({ action: z.enum(["confirm", "discard"]), id: z.uuidv4() }).strict(),
]);
const statusByCode = new Map([
  ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404],
  ["REQUEST_CONFLICT", 409], ["EMPTY_AUDIENCE", 422],
]);

const reply = (status: number, value: unknown) =>
  Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleNativeBroadcast(request: Request, origin: string, services: Services) {
  if (request.method !== "GET" && request.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
  if (request.method === "POST") {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  }
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (request.method === "GET") return reply(200, await services.read(viewer));
    const requestId = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const command = commandSchema.safeParse(await readNativeAdminJson(request));
    if (!command.success) return reply(422, { error: "INVALID_DRAFT" });
    const { action } = command.data;
    if (action === "prepare") {
      const draft = { ...command.data.draft, link: command.data.draft.link || "/dashboard" };
      return reply(200, { receipt: await services.prepare(viewer, requestId.data, draft) });
    }
    if (requestId.data !== command.data.id) return reply(400, { error: "INVALID_REQUEST_ID" });
    return reply(200, { receipt: await services.transition(viewer, command.data.id, action) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = statusByCode.get(code);
    return status ? reply(status, { error: code }) : reply(500, { error: "BROADCAST_REQUEST_FAILED" });
  }
}
