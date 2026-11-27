import { z } from "zod";
import { courseCommandReply, type CourseCommandAuth, type CourseCommandViewer } from "../course-command";
import { readNativeAdminJson } from "./request-validation";

export async function handleAdminCommand<T>(request: Request, origin: string, auth: CourseCommandAuth, schema: z.ZodType<T>,
  run: (input: T, requestId: string, viewer: CourseCommandViewer) => Promise<{ id: string }>,
  domainStatuses: Readonly<Record<string, 404 | 409 | 422>> = {}) {
  const reply = courseCommandReply;
  const site = request.headers.get("sec-fetch-site");
  if (request.method !== "POST") return reply(405, { error: "INVALID_METHOD" });
  if (request.headers.get("origin") !== origin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await auth.session();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!await auth.hasAdmin(viewer.user.id)) return reply(403, { error: "FORBIDDEN" });
    const key = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) return reply(400, { error: "INVALID_REQUEST_ID" });
    const input = schema.safeParse(await readNativeAdminJson(request));
    if (!input.success) return reply(422, { error: "INVALID_INPUT" });
    const { id } = await run(input.data, key.data, viewer);
    return reply(200, { status: "saved", id, requestId: key.data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statuses: Record<string, number> = { ...domainStatuses,
      UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, REQUEST_CONFLICT: 409, REVISION_CONFLICT: 409, INVALID_INPUT: 422,
    };
    return Object.hasOwn(statuses, code) ? reply(statuses[code], { error: code }) : reply(500, { error: "SAVE_FAILED" });
  }
}
