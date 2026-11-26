import type { TutorLiveAction, TutorLiveRoom, TutorLiveSelection } from "@/packages/academic/tutor-support";
import { codingLocatorSchema } from "@/lib/coding/contracts";
import { readTutorCommandBody, type TutorSupportServices } from "./handle-tutor-support";

export type TutorLiveServices = Pick<TutorSupportServices, "session" | "hasTutor" | "authorizeCourse"> & {
  resume(userId: string, courseId: string, sessionId?: string): Promise<TutorLiveRoom | null>;
  create(courseId: string, selection: TutorLiveSelection): Promise<Response>;
  control(sessionId: string, action: TutorLiveAction): Promise<Response>;
  ownsRoom(userId: string, courseId: string, sessionId: string): Promise<boolean>;
};

const validId = (value: unknown): value is string => typeof value === "string" && /^[\p{L}\p{N}._:-]{1,160}$/u.test(value)
  && value !== "." && value !== "..";
const liveActions = new Set<string>(["start", "reveal", "next", "end"]);
const failed = { error: "LIVE_UNAVAILABLE" };

function reply(status: number, value: unknown) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

function room(value: unknown, id: unknown): TutorLiveRoom | null {
  if (!value || typeof value !== "object" || !validId(id) || !("code" in value) || typeof value.code !== "string" ||
    !("questionCount" in value) || typeof value.questionCount !== "number" || !Number.isSafeInteger(value.questionCount) || value.questionCount < 0 ||
    !("wsUrl" in value) || typeof value.wsUrl !== "string" || !("hostToken" in value) || typeof value.hostToken !== "string") return null;
  return { id, code: value.code, questionCount: value.questionCount, wsUrl: value.wsUrl, hostToken: value.hostToken };
}

export async function handleTutorLive(request: Request, courseId: string, origin: string, services: TutorLiveServices) {
  const writing = request.method === "POST";
  if (!validId(courseId)) return reply(400, failed);
  if (writing && (request.headers.get("Origin") !== origin || request.headers.get("Sec-Fetch-Site") === "cross-site")) return reply(403, failed);
  if (writing && request.headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() !== "application/json") return reply(415, failed);
  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, failed);
    const { id: userId } = session.user;
    if (!await services.hasTutor(userId)) return reply(403, failed);
    await services.authorizeCourse(userId, courseId);

    if (!writing) {
      const ids = new URL(request.url).searchParams.getAll("sessionId");
      if (ids.length > 1 || (ids.length && !validId(ids[0]))) return reply(400, failed);
      return reply(200, await services.resume(userId, courseId, ids[0]));
    }

    const body = await readTutorCommandBody(request);
    if (!body || typeof body !== "object") return reply(400, failed);
    const keys = Object.keys(body);
    const coding = keys.length === 1 && "codingProblem" in body ? codingLocatorSchema.safeParse(body.codingProblem) : undefined;
    const selection = keys.length === 1 && "templateId" in body && validId(body.templateId) ? { templateId: body.templateId }
      : coding?.success ? { codingProblem: coding.data } : undefined;
    if (selection) {
      const response = await services.create(courseId, selection);
      if (!response.ok) return reply(response.status, failed);
      const result = await response.json();
      const created = room(result, result?.sessionId);
      return created ? reply(200, { ...created, ...("codingProblem" in selection ? { kind: "coding" } : {}) }) : reply(502, failed);
    }
    if (keys.length === 2 && "sessionId" in body && validId(body.sessionId) &&
      "action" in body && typeof body.action === "string" && liveActions.has(body.action)) {
      if (!await services.ownsRoom(userId, courseId, body.sessionId)) return reply(403, failed);
      const response = await services.control(body.sessionId, body.action as TutorLiveAction);
      return response.ok ? reply(200, { ok: true }) : reply(response.status, failed);
    }
    return reply(400, failed);
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("TUTOR_ACCESS_DENIED") || error.message === "TUTOR_INACTIVE")) {
      return reply(403, failed);
    }
    return reply(500, failed);
  }
}
