import { validDiscussionId, validDiscussionText } from "@/lib/discussions/policy";
import type {
  TutorDiscussionDetail,
  TutorDiscussionDraft,
  TutorDiscussionSendResult,
  TutorSupportReads,
} from "@/packages/academic/tutor-support";
import { parseTutorWeek } from "@/packages/academic/tutor-support";

export type TutorSupportServices = {
  session(): Promise<{ user: { id: string } } | null>;
  hasTutor(userId: string): Promise<boolean>;
  authorizeCourse(userId: string, courseId: string): Promise<void>;
  discussion(userId: string, courseId: string | undefined, threadId: string, cursor: string | undefined, targetMessageId?: string): Promise<TutorDiscussionDetail>;
  answer(userId: string, courseId: string | undefined, threadId: string, draft: TutorDiscussionDraft): Promise<TutorDiscussionSendResult>;
} & {
  [Key in keyof Omit<TutorSupportReads, "discussion">]: (
    userId: string,
    ...input: Parameters<TutorSupportReads[Key]> extends [...infer Args, AbortSignal] ? Args : never
  ) => ReturnType<TutorSupportReads[Key]>;
};

function reply(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

const safeId = (value: string) => value.length <= 256 && /^[^/\\\s\0]+$/.test(value);

export async function handleTutorSupport(url: URL, parts: string[], services: TutorSupportServices) {
  const [section, id, operation] = parts;
  const { searchParams } = url;
  const thread = searchParams.get("thread") ?? undefined;
  const message = searchParams.get("message") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const search = searchParams.get("search") ?? "";
  if (parts.some((part) => !safeId(part)) || (thread && !safeId(thread)) ||
      (message && (!validDiscussionId(message) || !thread || cursor)) ||
      (cursor && cursor.length > 2048) || search.length > 160 || search.includes("\0")) {
    return reply(400, { error: "INVALID_INPUT" });
  }
  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    const userId = session.user.id;
    if (!(await services.hasTutor(userId))) return reply(403, { error: "FORBIDDEN" });

    if (section === "schedule" && parts.length === 1) {
      return reply(200, await services.schedule(userId, parseTutorWeek(searchParams.get("week"))));
    }
    if (section === "discussions" && parts.length === 1) {
      return reply(200, thread
        ? await services.discussion(userId, undefined, thread, cursor, message)
        : await services.discussions(userId, undefined, search, cursor));
    }
    if (section === "courses" && id && parts.length === 3) {
      await services.authorizeCourse(userId, id);
      switch (operation) {
        case "materials": return reply(200, await services.materials(userId, id));
        case "videos": return reply(200, await services.videos(userId, id));
        case "live": return reply(200, await services.live(userId, id));
        case "discussions": return reply(200, thread
          ? await services.discussion(userId, id, thread, cursor, message)
          : await services.discussions(userId, id, search, cursor));
      }
    }
    return reply(404, { error: "NOT_FOUND" });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHORIZED") return reply(401, { error: "UNAUTHENTICATED" });
  if (code.startsWith("TUTOR_ACCESS_DENIED") || code === "TUTOR_INACTIVE" || code === "FORBIDDEN") return reply(403, { error: "FORBIDDEN" });
  if (code === "DISCUSSION_INVALID") return reply(400, { error: "INVALID_INPUT" });
  if (code === "DISCUSSION_UNAVAILABLE" || code === "NOT_FOUND") return reply(404, { error: "NOT_FOUND" });
  return reply(500, { error: "REQUEST_FAILED" });
}

export async function readTutorCommandBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleTutorDiscussionAnswer(request: Request, parts: string[], trustedOrigin: string, services: TutorSupportServices) {
  if (request.headers.get("Origin") !== trustedOrigin || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return reply(403, { error: "FORBIDDEN" });
  }
  if (request.headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() !== "application/json") {
    return reply(415, { error: "UNSUPPORTED_CONTENT_TYPE" });
  }
  const [section, id, page] = parts;
  const global = section === "discussions" && parts.length === 1;
  const scoped = section === "courses" && id && parts.length === 3 && page === "discussions" && safeId(id);
  if (!global && !scoped) return reply(404, { error: "NOT_FOUND" });

  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    const userId = session.user.id;
    if (!(await services.hasTutor(userId))) return reply(403, { error: "FORBIDDEN" });
    const courseId = global ? undefined : id;
    if (courseId) await services.authorizeCourse(userId, courseId);
    const value = await readTutorCommandBody(request);
    if (!value || typeof value !== "object") return reply(400, { error: "INVALID_INPUT" });
    const { threadId, body, requestId } = value as Record<string, unknown>;
    if (!validDiscussionId(threadId) || !validDiscussionText(body, 12000) ||
        !validDiscussionId(requestId) || requestId !== request.headers.get("Idempotency-Key")) {
      return reply(400, { error: "INVALID_INPUT" });
    }
    return reply(200, await services.answer(userId, courseId, threadId, { body, requestId }));
  } catch (error) {
    return failure(error);
  }
}
