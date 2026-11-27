import { z } from "zod";
import { tutorMentionCandidate } from "../../../../../packages/academic/tutor-discussion-mentions";
import { tutorDiscussionId, tutorDiscussionWorkspacePath, type TutorDiscussionWorkspaceAction, type TutorDiscussionWorkspaceClient,
  type TutorDiscussionForward, type TutorDiscussionMessageScope, type TutorQuestionAttempt, type TutorQuestionDraft } from "../../../../../packages/academic/tutor-discussion-workspace";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import type { AcademicTransport } from "../client";

const channel = z.object({
  id: tutorDiscussionId, kind: z.enum(["global", "course", "technical", "academic"]),
  title: z.string(), courseId: z.string().nullable(), courseTitle: z.string().nullish(),
  requesterName: z.string().nullish(), isRequester: z.boolean().optional(), muted: z.boolean(),
});
const catalog = z.object({ items: z.array(channel).max(20), nextCursor: z.string().nullable() });
const forwardTargets = z.object({ items: z.array(z.object({ id: tutorDiscussionId, title: z.string(), channelId: tutorDiscussionId })).max(30),
  nextCursor: z.string().nullable() });
const receipt = z.object({ threadId: tutorDiscussionId, messageId: tutorDiscussionId });
const sendResult = z.union([
  z.object({ ok: z.literal(true), value: receipt }),
  z.object({ ok: z.literal(false), error: z.literal("replay_unverified"), value: receipt }),
  z.object({ ok: z.literal(false), error: z.enum(["unknown", "invalid", "unavailable", "conflict", "resolved", "rate_limited", "attachment_expired"]) }),
]);

export function createTutorDiscussionWorkspace(transport: AcademicTransport, pathFor = tutorDiscussionWorkspacePath): TutorDiscussionWorkspaceClient | undefined {
  const command = transport.command?.bind(transport);
  if (!command) return undefined;
  const drafts = new Map<string, TutorQuestionDraft>();
  const pending = new Map<string, TutorQuestionAttempt>();
  const forwards = new Map<string, TutorDiscussionForward>();
  const key = (scope: TutorDiscussionMessageScope) => JSON.stringify([scope.threadId, scope.messageId]);
  async function read<T>(schema: z.ZodType<T>, courseId: string | undefined, query: Record<string, string>, signal: AbortSignal) {
    const response = await transport.get(pathFor(courseId) + "?" + new URLSearchParams(query), signal);
    if (!response.ok) throw new TutorDataError(response.status);
    const result = schema.safeParse(await response.json());
    if (!result.success) throw new TutorDataError(502);
    return result.data;
  }

  async function write(courseId: string | undefined, body: TutorDiscussionWorkspaceAction, signal: AbortSignal) {
    const response = await command!(pathFor(courseId), { method: "POST", requestId: body.requestId, body }, signal);
    return response;
  }

  return {
    catalog: (courseId, search, cursor, signal) => read(catalog, courseId, { view: "catalog", search, ...(cursor ? { cursor } : {}) }, signal),
    channelMentions: (courseId, channelId, search, signal) =>
      read(z.array(tutorMentionCandidate).max(100), courseId, { view: "channel-mentions", channel: channelId, search }, signal),
    async mute(courseId, channelId, muted, requestId, signal) {
      const response = await write(courseId, { action: "mute", channelId, muted, requestId }, signal);
      if (!response.ok) throw new TutorDataError(response.status);
      const result = z.object({ ok: z.literal(true) }).safeParse(await response.json());
      if (!result.success) throw new TutorDataError(502);
    },
    questionDraft: channelId => drafts.get(channelId),
    rememberQuestionDraft(channelId, draft) {
      drafts.delete(channelId);
      if (draft.body || draft.title || draft.images.length) drafts.set(channelId, draft);
      if (drafts.size > 50) {
        const oldest = drafts.keys().next().value;
        if (oldest) drafts.delete(oldest);
      }
    },
    pendingQuestion: channelId => pending.get(channelId),
    forwardChannels: (courseId, scope, search, cursor, signal) => read(catalog, courseId, {
      view: "forward-channels", thread: scope.threadId, message: scope.messageId, search, ...(cursor ? { cursor } : {}),
    }, signal),
    forwardTargets: (courseId, scope, channelId, search, cursor, signal) => read(forwardTargets, courseId, {
      view: "forward-targets", thread: scope.threadId, message: scope.messageId, channel: channelId, search, ...(cursor ? { cursor } : {}),
    }, signal),
    pendingForward: scope => forwards.get(key(scope)),
    async forward(courseId, next, signal) {
      const source = key(next);
      const previous = forwards.get(source);
      if (previous && previous.destinationId !== next.destinationId) return { ok: false, error: "unknown" };
      const attempt = previous ?? next;
      forwards.set(source, attempt);
      const response = await write(courseId, attempt, signal);
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 413, 415, 422].includes(response.status)) forwards.delete(source);
        throw new TutorDataError(response.status);
      }
      const result = sendResult.safeParse(await response.json());
      if (!result.success || ("value" in result.data && result.data.value.threadId !== attempt.destinationId)) throw new TutorDataError(502);
      if (result.data.ok || !["unknown", "rate_limited"].includes(result.data.error)) forwards.delete(source);
      return result.data;
    },
    async message(courseId, action, signal) {
      const response = await write(courseId, action, signal);
      if (!response.ok) throw new TutorDataError(response.status);
      const result = z.object({ ok: z.literal(true) }).safeParse(await response.json());
      if (!result.success) throw new TutorDataError(502);
    },
    async create(courseId, next, signal) {
      const { channelId } = next.input;
      const previous = pending.get(channelId);
      if (previous && JSON.stringify(previous.input) !== JSON.stringify(next.input)) return { ok: false, error: "unknown" };
      const attempt = previous ?? next;
      pending.set(channelId, attempt);
      const response = await write(courseId, attempt, signal);
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 413, 415, 422].includes(response.status)) pending.delete(channelId);
        throw new TutorDataError(response.status);
      }
      const result = sendResult.safeParse(await response.json());
      if (!result.success) throw new TutorDataError(502);
      if (result.data.ok || !["unknown", "rate_limited"].includes(result.data.error)) pending.delete(channelId);
      if (result.data.ok || result.data.error === "replay_unverified") drafts.delete(channelId);
      return result.data;
    },
  };
}
