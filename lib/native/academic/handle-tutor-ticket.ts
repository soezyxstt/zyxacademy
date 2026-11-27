import { z } from "zod";
import { quizGradingRequestIdSchema } from "@/lib/tutor/quiz-grading-contract";
import { courseCommandReply as reply, validCourseCommandId } from "./course-command";
import { readTutorCommandBody } from "./handle-tutor-support";
import type { TicketActor, writeTutorTicket } from "./tutor-ticket-service";
import type { writeTutorCalendar } from "./tutor-calendar-service";
import { isCalendarDate } from "@/lib/date-utils";

const text = z.string().trim().max(2000).refine(value => !value.includes("\0"));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), message: text.refine(value => value.length > 0) }).strict(),
  z.object({ action: z.literal("decide"), decision: z.enum(["approved", "rejected"]), notes: text }).strict(),
]);

type ScheduleAuth = {
  session(): Promise<{ user: { id: string }; session?: { id: string } } | null>;
  hasTutor(id: string): Promise<boolean>;
};

export async function handleTutorTicket(request: Request, parts: string[], expectedOrigin: string, services: ScheduleAuth & { save: typeof writeTutorTicket }) {
  if (parts.length !== 3 || parts[0] !== "schedule" || parts[1] !== "tickets" || !validCourseCommandId(parts[2])) return reply(404, { error: "NOT_FOUND" });
  return handleScheduleCommand(request, expectedOrigin, services, schema, (actor, input) => services.save(actor, parts[2], input));
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => isCalendarDate(value));
const id = z.string().refine(validCourseCommandId);
const calendar = z.discriminatedUnion("action", [
  z.object({ action: z.literal("copy"), week: date }).strict(),
  z.object({ action: z.literal("move"), bookingId: id, expectedSlotId: id, targetSlotId: id, date, reason: text }).strict(),
  z.object({ action: z.literal("delete"), slotId: id, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(),
]);

export function handleTutorCalendar(request: Request, origin: string, services: ScheduleAuth & { save: typeof writeTutorCalendar }) {
  return handleScheduleCommand(request, origin, services, calendar, services.save);
}

async function handleScheduleCommand<T>(request: Request, expectedOrigin: string, services: ScheduleAuth, inputSchema: z.ZodType<T>,
  save: (actor: TicketActor, draft: T) => Promise<unknown>) {
  const site = request.headers.get("sec-fetch-site");
  if (request.method !== "POST") return reply(405, { error: "METHOD" });
  if (request.headers.get("origin") !== expectedOrigin || (site && site !== "same-origin")) return reply(403, { error: "INVALID_ORIGIN" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session?.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!await services.hasTutor(viewer.user.id)) return reply(403, { error: "FORBIDDEN" });
    const key = quizGradingRequestIdSchema.safeParse(request.headers.get("idempotency-key"));
    const input = inputSchema.safeParse(await readTutorCommandBody(request));
    if (!key.success || !input.success) return reply(422, { error: "INVALID_INPUT" });
    return reply(200, await save({ id: viewer.user.id, sessionId: viewer.session.id, requestId: key.data }, input.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statuses: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 };
    const status = Object.hasOwn(statuses, code) ? statuses[code] : undefined;
    return reply(status ?? 500, { error: status ? code : "SAVE_FAILED" });
  }
}
