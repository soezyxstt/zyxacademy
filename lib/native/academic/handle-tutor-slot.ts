import { z } from "zod";
import type { TutorSlotReceipt } from "@/packages/academic/tutor-slot";
import { quizGradingRequestIdSchema } from "@/lib/tutor/quiz-grading-contract";
import { tryoutGradeRevisionPattern } from "@/packages/academic/tryout-grade";
import { readTutorCommandBody } from "./handle-tutor-support";
import { TutorSlotWriteError, type TutorSlotWriteService } from "./tutor-slot-service";

type Services = {
  session(): Promise<{ user: { id: string }; session?: { id: string } } | null>;
  hasTutor(userId: string): Promise<boolean>;
  save: TutorSlotWriteService;
};

const safeText = (limit: number) => z.string().max(limit).refine((value) => !value.includes("\0"));
const fields = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/),
  mode: z.enum(["online", "offline"]),
  location: safeText(500),
  notes: safeText(4000),
  courseIds: z.array(z.string().trim().min(1).max(256)).max(50).optional(),
  weeks: z.number().int().min(1).max(4).optional(),
}).strict();
const editFields = fields.extend({ weeks: z.literal(1).optional(), expectedRevision: z.string().regex(tryoutGradeRevisionPattern) });

function respond(status: number, value: unknown) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleTutorSlotWrite(request: Request, parts: string[], expectedOrigin: string, services: Services) {
  const [section, resource, slotId] = parts;
  const edit = request.method === "PATCH";
  if (section !== "schedule" || resource !== "slots" ||
      (edit ? parts.length !== 3 : request.method !== "POST" || parts.length !== 2)) return respond(404, { error: "NOT_FOUND" });
  if (edit && (!slotId || slotId.length > 256 || /[\s/\\\u0000-\u001f]/.test(slotId))) return respond(400, { error: "INVALID_SLOT_ID" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== expectedOrigin || (fetchSite && fetchSite !== "same-origin")) {
    return respond(403, { error: "INVALID_ORIGIN" });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return respond(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const session = await services.session();
    if (!session?.user.id || !session.session?.id) return respond(401, { error: "UNAUTHENTICATED" });
    if (!(await services.hasTutor(session.user.id))) return respond(403, { error: "FORBIDDEN" });
    const requestId = quizGradingRequestIdSchema.safeParse(request.headers.get("idempotency-key"));
    if (!requestId.success) return respond(400, { error: "INVALID_REQUEST_ID" });

    const actor = { id: session.user.id, sessionId: session.session.id, requestId: requestId.data };
    const json = await readTutorCommandBody(request);
    const parse = (edit ? editFields : fields).safeParse(json);
    if (!parse.success) return respond(400, { error: "INVALID_INPUT" });
    const { expectedRevision, ...command } = parse.data as z.output<typeof fields> & { expectedRevision?: string };
    const outcome = await services.save(actor, command, expectedRevision ? { slotId, expectedRevision } : undefined);
    return respond(200, { ...outcome, requestId: requestId.data } satisfies TutorSlotReceipt);
  } catch (error) {
    if (error instanceof TutorSlotWriteError) return respond(error.status, { error: error.code });
    return respond(500, { error: "SLOT_WRITE_FAILED" });
  }
}
