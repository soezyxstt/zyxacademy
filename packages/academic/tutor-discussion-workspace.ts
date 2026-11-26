import { z } from "zod";
import type { DiscussionChannelMetadata, DiscussionMention, DiscussionPage, DiscussionSendResult } from "../../lib/discussions/contracts";
import { validDiscussionId } from "../../lib/discussions/policy";
import { tutorMentionInput } from "./tutor-discussion-mentions";
import type { TutorDiscussionComposerDraft } from "./tutor-support";

export const tutorDiscussionId = z.string().refine(validDiscussionId);
export const tutorDiscussionQuestionInput = tutorMentionInput.extend({
  channelId: tutorDiscussionId,
  body: z.string().max(12_000),
  title: z.string().max(160).optional(),
  attachmentIds: z.array(tutorDiscussionId).max(4).refine(ids => new Set(ids).size === ids.length).optional(),
}).strict();

export const tutorDiscussionWorkspaceAction = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), requestId: tutorDiscussionId, input: tutorDiscussionQuestionInput }),
  z.strictObject({ action: z.literal("mute"), requestId: tutorDiscussionId, channelId: tutorDiscussionId, muted: z.boolean() }),
]);

export type TutorDiscussionWorkspaceAction = z.infer<typeof tutorDiscussionWorkspaceAction>;
export type TutorDiscussionQuestion = z.infer<typeof tutorDiscussionQuestionInput>;
export type TutorQuestionDraft = TutorDiscussionComposerDraft & { title: string };
export type TutorQuestionAttempt = Extract<TutorDiscussionWorkspaceAction, { action: "create" }>;

export type TutorDiscussionWorkspaceClient = {
  catalog(courseId: string | undefined, search: string, cursor: string | undefined, signal: AbortSignal): Promise<DiscussionPage<DiscussionChannelMetadata>>;
  channelMentions(courseId: string | undefined, channelId: string, search: string, signal: AbortSignal): Promise<DiscussionMention[]>;
  mute(courseId: string | undefined, channelId: string, muted: boolean, requestId: string, signal: AbortSignal): Promise<void>;
  questionDraft(channelId: string): TutorQuestionDraft | undefined;
  rememberQuestionDraft(channelId: string, draft: TutorQuestionDraft): void;
  pendingQuestion(channelId: string): TutorQuestionAttempt | undefined;
  create(courseId: string | undefined, attempt: TutorQuestionAttempt, signal: AbortSignal): Promise<DiscussionSendResult>;
};

export function tutorDiscussionWorkspacePath(courseId: string | undefined) {
  return "/api/native/academic/tutor-support/" + (courseId ? `courses/${encodeURIComponent(courseId)}/` : "") + "discussions/workspace";
}
