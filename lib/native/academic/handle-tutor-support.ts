import { DISCUSSION_REACTIONS, validDiscussionId, validDiscussionText } from "@/lib/discussions/policy";
import type { DiscussionMention } from "@/lib/discussions/contracts";
import { tutorMentionInput, validTutorMentionInput, type TutorDiscussionProfile } from "@/packages/academic/tutor-discussion-mentions";
import { DISCUSSION_IMAGE_MAX_COUNT } from "@/lib/discussions/image-limits";
import { z } from "zod";
import type {
  TutorDiscussionDetail,
  TutorDiscussionList,
  TutorDiscussionListFilter,
  TutorDiscussionDraft,
  TutorDiscussionChange,
  TutorDiscussionSendResult,
  TutorSupportReads,
} from "@/packages/academic/tutor-support";
import { parseTutorWeek } from "@/packages/academic/tutor-support";

export type TutorSupportServices = {
  session(): Promise<{ user: { id: string } } | null>;
  hasTutor(userId: string): Promise<boolean>;
  authorizeCourse(userId: string, courseId: string): Promise<void>;
  authorizeMaterialsCourse?(userId: string, courseId: string): Promise<void>;
  discussions(userId: string, courseId: string | undefined, search: string, cursor: string | undefined, filter?: TutorDiscussionListFilter): Promise<TutorDiscussionList>;
  discussion(userId: string, courseId: string | undefined, threadId: string, cursor: string | undefined, targetMessageId?: string): Promise<TutorDiscussionDetail>;
  answer(userId: string, courseId: string | undefined, threadId: string, draft: TutorDiscussionDraft): Promise<TutorDiscussionSendResult>;
  mentions?(userId: string, courseId: string | undefined, threadId: string, search: string): Promise<DiscussionMention[]>;
  profile?(userId: string, courseId: string | undefined, threadId: string, personId: string): Promise<TutorDiscussionProfile>;
  changeDiscussion?(userId: string, courseId: string | undefined, threadId: string, change: TutorDiscussionChange): Promise<void>;
} & {
  [Key in keyof Omit<TutorSupportReads, "discussion" | "discussions">]: (
    userId: string,
    ...input: Parameters<TutorSupportReads[Key]> extends [...infer Args, AbortSignal] ? Args : never
  ) => ReturnType<TutorSupportReads[Key]>;
};

function reply(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

const safeId = (value: string) => value.length <= 256 && /^[^/\\\s\0]+$/.test(value);
const discussionId = z.string().refine(validDiscussionId);
const discussionChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), throughSeq: z.number().int().nonnegative(), receipt: z.string().min(1).max(25_000),
    messageIds: z.array(discussionId).max(100).refine(ids => new Set(ids).size === ids.length) }),
  z.object({ action: z.literal("reaction"), messageId: discussionId, emoji: z.enum(DISCUSSION_REACTIONS), selected: z.boolean() }),
  z.object({ action: z.literal("resolve"), resolved: z.boolean() }),
]);

export async function handleTutorSupport(url: URL, parts: string[], services: TutorSupportServices) {
  const [section, id, operation] = parts;
  const { searchParams } = url;
  const thread = searchParams.get("thread") ?? undefined;
  const message = searchParams.get("message") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const search = searchParams.get("search") ?? "";
  const mention = searchParams.get("mention");
  const person = searchParams.get("profile");
  const lookup = mention !== null || person !== null;
  const channelId = searchParams.get("channel") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  if ((channelId !== undefined && !validDiscussionId(channelId)) || (status !== undefined && status !== "open" && status !== "resolved") ||
    (thread && (channelId || status))) return reply(400, { error: "INVALID_INPUT" });
  const filter = channelId || status ? { channelId, status } : undefined;
  if (parts.some((part) => !safeId(part)) || (thread && !safeId(thread)) ||
      (message && (!validDiscussionId(message) || !thread || cursor)) ||
      (cursor && cursor.length > 2048) || search.length > 160 || search.includes("\0")) {
    return reply(400, { error: "INVALID_INPUT" });
  }
  if (lookup && (!thread || searchParams.getAll("thread").length !== 1 || !validDiscussionId(thread) || message || cursor || search ||
    (mention !== null && (person !== null || searchParams.getAll("mention").length !== 1 || mention.trim().length < 2 || mention.length > 80 || /[\u0000-\u001f]/.test(mention))) ||
    (person !== null && (searchParams.getAll("profile").length !== 1 || !validDiscussionId(person))))) {
    return reply(400, { error: "INVALID_INPUT" });
  }
  try {
    const session = await services.session();
    if (!session?.user.id) return reply(401, { error: "UNAUTHENTICATED" });
    const userId = session.user.id;
    if (!(await services.hasTutor(userId))) return reply(403, { error: "FORBIDDEN" });

    if (lookup && thread) {
      const global = section === "discussions" && parts.length === 1;
      const courseId = section === "courses" && parts.length === 3 && operation === "discussions" ? id : undefined;
      if (!global && !courseId) return reply(404, { error: "NOT_FOUND" });
      if (courseId) await services.authorizeCourse(userId, courseId);
      if (mention !== null && services.mentions) return reply(200, await services.mentions(userId, courseId, thread, mention.trim()));
      if (person !== null && services.profile) return reply(200, await services.profile(userId, courseId, thread, person));
      return reply(404, { error: "NOT_FOUND" });
    }
    if (section === "schedule" && parts.length === 1) {
      return reply(200, await services.schedule(userId, parseTutorWeek(searchParams.get("week"))));
    }
    if (section === "discussions" && parts.length === 1) {
      return reply(200, thread
        ? await services.discussion(userId, undefined, thread, cursor, message)
        : await services.discussions(userId, undefined, search, cursor, filter));
    }
    if (section === "courses" && id && parts.length === 3) {
      if (operation === "materials" && services.authorizeMaterialsCourse) await services.authorizeMaterialsCourse(userId, id);
      else await services.authorizeCourse(userId, id);
      switch (operation) {
        case "materials": return reply(200, await services.materials(userId, id));
        case "videos": return reply(200, await services.videos(userId, id));
        case "live": return reply(200, await services.live(userId, id));
        case "discussions": return reply(200, thread
          ? await services.discussion(userId, id, thread, cursor, message)
          : await services.discussions(userId, id, search, cursor, filter));
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
    const { threadId, body, requestId, replyTo, attachmentIds, mentionIds, mentionHandles, askZyra, ...extra } = value as Record<string, unknown>;
    if (!validDiscussionId(threadId) || !validDiscussionId(requestId) || requestId !== request.headers.get("Idempotency-Key")) {
      return reply(400, { error: "INVALID_INPUT" });
    }
    if (extra.action !== undefined) {
      const parsed = discussionChange.safeParse(extra);
      if (!parsed.success || body !== undefined || replyTo !== undefined || attachmentIds !== undefined || mentionIds !== undefined ||
        mentionHandles !== undefined || askZyra !== undefined || !services.changeDiscussion) {
        return reply(400, { error: "INVALID_INPUT" });
      }
      await services.changeDiscussion(userId, courseId, threadId, parsed.data);
      return reply(200, { ok: true });
    }
    if ((replyTo !== undefined && !validDiscussionId(replyTo)) ||
        (attachmentIds !== undefined && (!Array.isArray(attachmentIds) || attachmentIds.length > DISCUSSION_IMAGE_MAX_COUNT ||
          !attachmentIds.every(validDiscussionId) || new Set(attachmentIds).size !== attachmentIds.length))) {
      return reply(400, { error: "INVALID_INPUT" });
    }
    const ids = Array.isArray(attachmentIds) ? attachmentIds as string[] : [];
    if (!validDiscussionText(body, 12000) && !(body === "" && ids.length > 0)) return reply(400, { error: "INVALID_INPUT" });
    const mentions = tutorMentionInput.safeParse({ mentionIds, mentionHandles, askZyra });
    if (!mentions.success || !validTutorMentionInput(body, mentions.data)) return reply(400, { error: "INVALID_INPUT" });
    return reply(200, await services.answer(userId, courseId, threadId, { body, requestId,
      ...(mentions.data.mentionIds?.length ? { mentionIds: mentions.data.mentionIds, mentionHandles: mentions.data.mentionHandles } : {}),
      ...(mentions.data.askZyra !== undefined ? { askZyra: mentions.data.askZyra } : {}),
      ...(typeof replyTo === "string" ? { replyTo } : {}), ...(ids.length ? { attachmentIds: ids } : {}),
    }));
  } catch (error) {
    return failure(error);
  }
}
