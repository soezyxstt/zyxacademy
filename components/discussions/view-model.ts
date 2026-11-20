import type { ReactNode } from "react";
import type { DiscussionAuthorProfile, DiscussionSendError, DiscussionSendFailure } from "@/lib/discussions/contracts";

export type DiscussionRole = "student" | "tutor" | "admin" | "zyra";
export type DiscussionPrivateKind = "academic" | "bug" | "feature" | "operations";
export type DiscussionQuestionStatus = "open" | "answered" | "resolved";
export type DiscussionLoadState = "ready" | "loading" | "error";

export type DiscussionPerson = {
  id: string;
  name: string;
  role: DiscussionRole;
  mention?: string;
  skinId?: string | null;
  avatarUrl?: string | null;
};

type DiscussionChannelBase = {
  id: string;
  name: string;
  unreadCount: number; // Questions with unread messages, independent of mute.
  muted: boolean;
  canCreate: boolean;
  courseId?: string | null;
  courseTitle?: string | null;
  requesterName?: string | null;
  isRequester?: boolean;
};

export type DiscussionChannel = DiscussionChannelBase & (
  | { kind: "global" | "course"; privacyLabel?: never; privateKind?: never }
  | { kind: "private"; privateKind: DiscussionPrivateKind; privacyLabel: string }
);

export type DiscussionQuestion = {
  id: string;
  channelId: string;
  title: string;
  status: DiscussionQuestionStatus;
  helpKind?: DiscussionPrivateKind | null;
  lastActivityAt: string;
  unreadCount: number; // Unread messages in this question.
  answerCount: number;
  allowedForwardChannelIds: string[];
  canReply: boolean;
  canResolve: boolean;
};

export type DiscussionAttachment = {
  id: string;
  name: string;
  url: string;
  downloadUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
  previewAvailable?: boolean;
};
export type DiscussionUploadError = "pixels" | "size" | "format" | "rate_limited" | "login" | "access" | "expired" | "unknown";
export type DiscussionUploadResult = { ok: true; attachment: DiscussionAttachment } | { ok: false; error: DiscussionUploadError };

export type DiscussionReaction = {
  emoji: string;
  count: number;
  selected: boolean;
};

export type DiscussionMessage = {
 mentionedPeople?: DiscussionPerson[];
  id: string;
  seq?: number;
  author: DiscussionPerson;
  skinId?: string | null;
  body: string;
  bodyKind?: "body" | "deleted" | "source_unavailable";
  createdAt: string;
  revision: number;
  messageType: "question" | "answer" | "reply" | "forward";
  editedAt?: string | null;
  replyTo?: { id: string; authorName: string; excerpt: string; authorKind?: "name" | "deleted" | "unavailable"; excerptKind?: "body" | "deleted" | "image" | "source_unavailable" } | null;
  attachments: DiscussionAttachment[];
  reactions: DiscussionReaction[];
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  canReply?: boolean;
  canForward?: boolean;
  canReact?: boolean;
};

export type DiscussionReport = {
  id: string;
  questionId: string;
  questionTitle: string;
  messageId: string;
  message?: { body: string; seq: number; deleted: boolean; authorName: string;
    bodyKind?: "body" | "deleted" | "image" | "source_unavailable"; authorKind?: "name" | "deleted" | "unavailable" };
  reporterName: string;
  reason: string;
  createdAt: string;
  status: "pending" | "resolved" | "dismissed";
};

export type DiscussionDraftInput = {
  body: string;
  attachments: DiscussionAttachment[];
  mentionIds: string[];
  mentionHandles?: string[];
  askZyra: boolean;
  skinId?: string | null;
  requestId: string;
};

export type DiscussionForwardTarget = { questionId: string; channelId: string; channelName?: string; title: string };
export type DiscussionForwardDraft = {
  targetChannel: DiscussionChannel | null;
  targetQuestion: string;
  targetTitle: string;
  requestId: string;
  status: "ready" | "sending" | "unknown" | "replay_unverified";
  error?: DiscussionSendError;
  replayTarget?: { threadId: string; messageId: string };
};
export type DiscussionMention = { avatarUrl?: string | null; id: string; name: string; mention: string; role?: "student" | "tutor" | "admin"; context?: string | null; hasNamesake?: boolean; ambiguous?: boolean };

export type DiscussionWorkspaceProps = {
  viewer: DiscussionPerson;
  channels: DiscussionChannel[];
  questions: DiscussionQuestion[];
  resolvedQuestions?: DiscussionQuestion[];
  resolvedOpen?: boolean;
  resolvedState?: DiscussionLoadState;
  resolvedPageIndex?: number;
  resolvedHasMore?: boolean;
  onResolvedOpenChange?: (open: boolean) => void;
  onResolvedPage?: (direction: "previous" | "next") => void;
  onRetryResolved?: () => void;
  selectedQuestion: DiscussionQuestion | null;
  messages: DiscussionMessage[];
  selectedChannelId: string | null;
  channelFilterLocked?: boolean;
  selectedQuestionId: string | null;
  selectedMessageId?: string | null;
  search: string;
  listState: DiscussionLoadState;
  threadState: DiscussionLoadState;
  reports?: DiscussionReport[];
  reportState?: DiscussionLoadState;
  onRetryReports?: () => void;
  activeTab?: "questions" | "reports";
  hasMoreQuestions?: boolean;
  hasMoreMessages?: boolean;
  onSelectChannel: (channel: DiscussionChannel | null) => void;
  onSelectQuestion: (questionId: string | null, messageId?: string | null) => void;
  onSearchChange: (search: string) => void;
  onTabChange?: (tab: "questions" | "reports") => void;
  onRetryQuestions: () => void;
  onRetryMessages: () => void;
  readError?: boolean;
  onRetryRead?: () => void;
  onLoadMoreQuestions?: () => Promise<void>;
  onLoadMoreMessages?: () => Promise<void>;
  onCreateQuestion: (input: DiscussionDraftInput & { channelId: string; title?: string }) => Promise<DiscussionSendFailure | void>;
  onSendReply: (input: DiscussionDraftInput & { questionId: string; messageType: "answer" | "reply"; replyToMessageId?: string }) => Promise<DiscussionSendFailure | void>;
  composerAudience?: string;
  canAskZyra?: boolean;
  onUploadImage?: (input: { file: File; channelId: string; questionId?: string }) => Promise<DiscussionUploadResult>;
  onSearchMentions: (input: { channelId: string; questionId?: string; query: string }) => Promise<DiscussionMention[]>;
  onSearchChannels: (input: { search: string; cursor?: string; courseId?: string; kind?: "course"; kinds?: ("global" | "course")[] }) => Promise<{ items: DiscussionChannel[]; nextCursor: string | null }>;
  onSearchForwardTargets: (input: { channelId?: string; search: string; cursor?: string }) => Promise<{ items: DiscussionForwardTarget[]; nextCursor: string | null }>;
  onEditMessage: (input: { questionId: string; messageId: string; body: string; revision: number }) => Promise<void>;
  onDeleteMessage: (input: { questionId: string; messageId: string }) => Promise<void>;
  onToggleReaction: (input: { questionId: string; messageId: string; emoji: string; selected: boolean }) => Promise<void>;
  onForwardMessage: (input: { questionId: string; messageId: string; targetChannelId: string; targetQuestionId: string; requestId: string }) => Promise<void | DiscussionSendFailure>;
  onReportMessage: (input: { questionId: string; messageId: string; reason: string }) => Promise<void>;
  onSetChannelMuted: (input: { channelId: string; muted: boolean }) => Promise<void>;
  onSetQuestionStatus?: (input: { questionId: string; status: DiscussionQuestionStatus }) => Promise<void>;
  onSetReportStatus?: (input: { reportId: string; status: "resolved" | "dismissed" }) => Promise<void>;
  onLoadAuthorProfile?: (input: { questionId: string; authorId: string }) => Promise<DiscussionAuthorProfile>;
  /** Local fixtures may render their own non-sensitive asset; adapters use the default. */
  renderAttachment?: (attachment: DiscussionAttachment) => ReactNode;
};
