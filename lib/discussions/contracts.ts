import type { PublicStudentProfile } from "@/lib/gamification/social-contracts";

export type DiscussionRole = "student" | "tutor" | "admin";
export type DiscussionChannelKind = "global" | "course" | "technical" | "academic";
export type DiscussionActor = { id: string; role: DiscussionRole };
export type DiscussionPage<T> = { items: T[]; nextCursor: string | null };
export type DiscussionThreadStatus = "open" | "resolved";
export type DiscussionSendError = "unavailable" | "invalid" | "rate_limited" | "conflict" | "resolved" | "attachment_expired" | "replay_unverified" | "unknown";
export type DiscussionReplayTarget = { threadId: string; messageId: string };
export type DiscussionSendFailure = Exclude<DiscussionSendError, "replay_unverified"> | { error: "replay_unverified"; target: DiscussionReplayTarget };
export type DiscussionSendResult = { ok: true; value: DiscussionReplayTarget } | { ok: false; error: Exclude<DiscussionSendError, "replay_unverified"> } | { ok: false; error: "replay_unverified"; value: DiscussionReplayTarget };

export type DiscussionChannelMetadata = {
 id: string; kind: DiscussionChannelKind; courseId: string | null; title: string;
 courseTitle?: string | null; requesterName?: string | null; isRequester?: boolean;
 muted: boolean;
};
export type DiscussionChannel = DiscussionChannelMetadata & { unreadThreads: number; activeThreads: number };
export type DiscussionThread = {
 id: string; channelId: string; title: string; status: DiscussionThreadStatus;
 labels: string[]; helpKind: DiscussionHelpKind | null; createdAt: string; lastActivityAt: string; answerCount: number;
 unreadCount: number; canReply: boolean; canResolve: boolean;
};
export type DiscussionHelpKind = "academic" | "bug" | "feature" | "operations";
export type DiscussionAttachment = {
 id: string; name: string; mime: "image/jpeg" | "image/png" | "image/webp";
 size: number; width: number; height: number; url: string; downloadUrl: string; previewAvailable?: boolean;
};
export type DiscussionMessage = {
 mentionedPeople?: { id: string; name: string; role: DiscussionRole; mention?: string }[];
 id: string; threadId: string; seq: number; author: { id: string; name: string; role: DiscussionRole | null; avatarUrl?: string | null } | null;
 kind: "human" | "zyra"; messageType: "question" | "answer" | "reply" | "forward";
 body: string; bodyKind?: "body" | "deleted" | "source_unavailable"; createdAt: string; editedAt: string | null; revision: number;
 replyTo: { id: string; seq: number; authorName?: string; excerpt?: string; authorKind?: "name" | "deleted" | "unavailable"; excerptKind?: "body" | "deleted" | "image" | "source_unavailable" } | null;
 forwardedFrom: { id: string; threadId: string } | null;
 skinId: string | null; attachments: DiscussionAttachment[];
 reactions: { emoji: string; count: number; selected: boolean }[];
 canEdit: boolean; canDelete: boolean; canReport: boolean; canReply: boolean; canForward: boolean; canReact: boolean;
};
export type DiscussionSubmit = {
 body: string; attachmentIds: string[]; mentionIds: string[]; mentionHandles?: string[]; askZyra: boolean;
 skinId?: string | null; requestId: string;
};
export type CreateDiscussionThread = DiscussionSubmit & {
 channelId?: string; courseId?: string; title?: string; helpKind?: DiscussionHelpKind | null;
};
export type ReplyToDiscussion = DiscussionSubmit & { threadId: string } & (
 | { messageType: "answer"; replyTo?: null }
 | { messageType: "reply"; replyTo: string }
);
export type DiscussionMention = { id: string; name: string; role?: DiscussionRole; context?: string | null; hasNamesake?: boolean; ambiguous?: boolean };
export type DiscussionReport = {
 id: string; messageId: string; threadId: string; threadTitle: string; reason: string;
 message: { body: string; seq: number; deleted: boolean; authorName: string;
  bodyKind?: "body" | "deleted" | "image" | "source_unavailable"; authorKind?: "name" | "deleted" | "unavailable" };
 status: "pending" | "resolved" | "dismissed"; createdAt: string;
 reporter: { id: string; name: string };
};
export type DiscussionStudentProfile = Omit<PublicStudentProfile, "publicId"> & { publicId: string | null };

export type DiscussionAuthorProfile =
 | { kind: "student"; name: string; role: DiscussionRole | null; profile: DiscussionStudentProfile }
 | {
   kind: "limited";
   id: string;
   name: string;
   role: DiscussionRole | null;
   avatarUrl: string | null;
   visibilityReason: "staff" | "private" | "blocked" | "unavailable";
  };
