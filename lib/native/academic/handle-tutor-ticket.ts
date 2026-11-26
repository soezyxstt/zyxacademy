import { z } from "zod";
import { quizGradingRequestIdSchema } from "@/lib/tutor/quiz-grading-contract";
import { courseCommandReply as reply, validCourseCommandId } from "./course-command";
import { readTutorCommandBody } from "./handle-tutor-support";
import type { writeTutorTicket } from "./tutor-ticket-service";

const text = z.string().trim().max(2000).refine(value => !value.includes("\0"));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), message: text.refine(value => value.length > 0) }).strict(),
  z.object({ action: z.literal("decide"), decision: z.enum(["approved", "rejected"]), notes: text }).strict(),
]);

export async function handleTutorTicket(request: Request, parts: string[], expectedOrigin: string, services: {
  session(): Promise<{ user: { id: string }; session?: { id: string } } | null>;
  hasTutor(id: string): Promise<boolean>;
  save: typeof writeTutorTicket;
}) {
  if (parts.length !== 3 || parts[0] !== "schedule" || parts[1] !== "tickets" || !validCourseCommandId(parts[2])) return reply(404, { error: "NOT_FOUND" });
  const site = request.headers.get("sec-fetch-site");
  if (request.method !== "POST") return reply(405, { error: "METHOD" });
  if (request.headers.get("origin") !== expectedOrigin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session?.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!await services.hasTutor(viewer.user.id)) return reply(403, { error: "FORBIDDEN" });
    const key = quizGradingRequestIdSchema.safeParse(request.headers.get("idempotency-key"));
    const input = schema.safeParse(await readTutorCommandBody(request));
    if (!key.success || !input.success) return reply(422, { error: "INVALID_INPUT" });
    return reply(200, await services.save({ id: viewer.user.id, sessionId: viewer.session.id, requestId: key.data }, parts[2], input.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statuses: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 };
    const status = Object.hasOwn(statuses, code) ? statuses[code] : undefined;
    return reply(status ?? 500, { error: status ? code : "SAVE_FAILED" });
  }
}
