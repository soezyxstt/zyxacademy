import { z } from "zod";
import { studyGroupPackages, studyGroupStatuses, validateStudyGroupFields, type StudyGroupWrite } from "../../../../packages/academic/study-group-edit";
import { nativeAdminIdSchema, readNativeAdminJson } from "./request-validation";
import type { StudyGroupWriteResult } from "./study-group-service";

type Viewer = { user: { id: string }; session: { id: string } };
type Services = {
  session(): Promise<Viewer | null>;
  hasAdmin(id: string): Promise<boolean>;
  write(command: StudyGroupWrite, requestId: string, viewer: Viewer): Promise<StudyGroupWriteResult>;
};

const fields = z.object({
  name: z.string().trim().min(1).max(180),
  packageType: z.enum(studyGroupPackages),
  totalQuotaSessions: z.number().int().min(0).max(100000),
  weeklyQuotaSessions: z.number().int().min(0).max(100000),
  academicYear: z.string().trim().max(9),
  semester: z.string().trim().min(1).max(50),
  startDate: z.iso.datetime({ offset: true }).nullable(),
  endDate: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(studyGroupStatuses),
  notes: z.string().trim().max(2000),
}).strict();
const createSchema = fields.extend({ courseIds: z.array(nativeAdminIdSchema).max(100) });
const editSchema = fields.extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  courseIds: z.array(nativeAdminIdSchema).max(100).refine(ids => new Set(ids).size === ids.length).optional(),
});

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handleStudyGroupWrite(request: Request, parts: string[], origin: string, services: Services) {
  const [section, id] = parts;
  const create = parts.length === 1 && request.method === "POST";
  const edit = parts.length === 2 && request.method === "PATCH";
  if (section !== "groups" || (!create && !edit)) return reply(404, { error: "NOT_FOUND" });
  if (edit && !nativeAdminIdSchema.safeParse(id).success) return reply(400, { error: "INVALID_PATH" });
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
    let command: StudyGroupWrite;
    if (create) {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success || validateStudyGroupFields(parsed.data)) return reply(422, { error: "INVALID_GROUP" });
      command = { type: "create", fields: parsed.data };
    } else {
      const parsed = editSchema.safeParse(body);
      if (!parsed.success || validateStudyGroupFields(parsed.data, true)) return reply(422, { error: "INVALID_GROUP" });
      command = { type: "edit", id, fields: parsed.data };
    }
    const result = await services.write(command, requestId, viewer);
    if (result.status === "conflict") return reply(409, result);
    return reply(200, { ...result, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return reply(401, { error: code });
    if (code === "FORBIDDEN") return reply(403, { error: code });
    if (code === "GROUP_NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
    if (code === "REQUEST_CONFLICT") return reply(409, { error: code });
    if (code === "INVALID_GROUP" || code === "INVALID_QUOTA" || code === "INVALID_COURSE" || code === "INVALID_DATES") return reply(422, { error: code });
    return reply(500, { error: "SAVE_FAILED" });
  }
}
