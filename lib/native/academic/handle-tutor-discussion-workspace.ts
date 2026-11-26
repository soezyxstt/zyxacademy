import type { DiscussionChannelMetadata, DiscussionMention, DiscussionPage, DiscussionSendResult } from "@/lib/discussions/contracts";
import { validDiscussionId, validDiscussionText } from "@/lib/discussions/policy";
import { tutorDiscussionWorkspaceAction, type TutorQuestionAttempt } from "@/packages/academic/tutor-discussion-workspace";
import { validTutorMentionInput } from "@/packages/academic/tutor-discussion-mentions";
import { readTutorCommandBody, type TutorSupportServices } from "./handle-tutor-support";

export type TutorDiscussionWorkspaceServices = Pick<TutorSupportServices, "session" | "hasTutor" | "authorizeCourse"> & {
  catalog(userId: string, courseId: string | undefined, search: string, cursor?: string): Promise<DiscussionPage<DiscussionChannelMetadata>>;
  channelMentions(userId: string, courseId: string | undefined, channelId: string, search: string): Promise<DiscussionMention[]>;
  create(userId: string, courseId: string | undefined, attempt: TutorQuestionAttempt): Promise<DiscussionSendResult>;
  mute(userId: string, courseId: string | undefined, channelId: string, muted: boolean): Promise<void>;
};

export function isTutorDiscussionWorkspace(parts: string[]) {
  return parts.length === 2 && parts[0] === "discussions" && parts[1] === "workspace" ||
    parts.length === 4 && parts[0] === "courses" && validDiscussionId(parts[1]) && parts[2] === "discussions" && parts[3] === "workspace";
}

const send = (status: number, data: unknown) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const invalid = () => send(400, { error: "invalid" });

export async function handleTutorDiscussionWorkspace(request: Request, parts: string[], origin: string, services: TutorDiscussionWorkspaceServices) {
  if (!isTutorDiscussionWorkspace(parts)) return send(404, { error: "unavailable" });
  const write = request.method === "POST";
  if (!write && request.method !== "GET") return send(405, { error: "invalid" });
  if (write && (request.headers.get("Origin") !== origin || request.headers.get("Sec-Fetch-Site") === "cross-site")) {
    return send(403, { error: "unavailable" });
  }
  if (write && request.headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() !== "application/json") {
    return send(415, { error: "invalid" });
  }
  try {
    const actorId = (await services.session())?.user.id;
    if (!actorId) return send(401, { error: "unavailable" });
    if (!(await services.hasTutor(actorId))) return send(403, { error: "unavailable" });
    const courseId = parts[0] === "courses" ? parts[1] : undefined;
    if (courseId) await services.authorizeCourse(actorId, courseId);
    if (!write) {
      const args = new URL(request.url).searchParams;
      const search = args.get("search")?.trim() ?? "";
      if (search.length > 160 || /[\u0000-\u001f]/.test(search)) return invalid();
      switch (args.get("view")) {
        case "catalog": {
          const cursor = args.get("cursor") ?? undefined;
          if (cursor && cursor.length > 500) return invalid();
          return send(200, await services.catalog(actorId, courseId, search, cursor));
        }
        case "channel-mentions": {
          const channelId = args.get("channel");
          if (!validDiscussionId(channelId) || search.length < 2 || search.length > 80) return invalid();
          return send(200, await services.channelMentions(actorId, courseId, channelId, search));
        }
        default: return invalid();
      }
    }
    const parsed = tutorDiscussionWorkspaceAction.safeParse(await readTutorCommandBody(request));
    if (!parsed.success || parsed.data.requestId !== request.headers.get("Idempotency-Key")) return invalid();
    const action = parsed.data;
    if (action.action === "mute") {
      await services.mute(actorId, courseId, action.channelId, action.muted);
      return send(200, { ok: true });
    }
    const { body, attachmentIds, title } = action.input;
    if ((!validDiscussionText(body, 12_000) && !(body === "" && attachmentIds?.length)) ||
      (title !== undefined && !validDiscussionText(title, 160)) || !validTutorMentionInput(body, action.input)) return invalid();
    return send(200, await services.create(actorId, courseId, action));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("TUTOR_ACCESS_DENIED") || code === "TUTOR_INACTIVE") return send(403, { error: "unavailable" });
    if (code === "DISCUSSION_UNAVAILABLE") return send(404, { error: "unavailable" });
    if (code === "DISCUSSION_INVALID") return invalid();
    return send(500, { error: "unknown" });
  }
}
