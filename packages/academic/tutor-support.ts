export type TutorScheduleData = {
  from: string;
  to: string;
  slots: { id: string; date: string; start: string; end: string; mode: string; location: string | null; booked: boolean }[];
  sessions: { id: string; date: string | null; start: string | null; end: string | null; courseTitle: string | null; groupName: string | null; topic: string | null; status: string }[];
  tickets: { id: string; type: "reschedule" | "cancellation"; status: "approved" | "rejected" | "pending"; reason: string; proposedDate: string | null }[];
  groups: { id: string; name: string; packageName: string; used: number; total: number; members: number }[];
};

export type TutorDiscussThread = {
  id: string;
  title: string;
  status: "open" | "resolved";
  answerCount: number;
  canReply: boolean;
};

export type TutorDiscussionList = {
  items: TutorDiscussThread[];
  nextCursor: string | null;
};

export type TutorDiscussionDetail = {
  thread: TutorDiscussThread;
  messages: {
    items: {
      id: string;
      seq: number;
      author: string | null;
      body: string;
      attachmentCount: number;
      messageType: "question" | "answer" | "reply" | "forward";
    }[];
    nextCursor: string | null;
  };
};

export type TutorMaterialsData = { title: string; items: { id: string; title: string; summary: string }[] };

export type TutorVideosData = {
  title: string;
  playlists: {
    id: string;
    title: string;
    description: string | null;
    videos: { id: string; title: string; duration: number | null; locked: boolean }[];
  }[];
};

export type TutorLiveData = {
  configured: boolean;
  templates: { id: string; title: string }[];
  active: { id: string; code: string; state: string; participantCount: number } | null;
};

export type TutorDiscussionTarget = { threadId: string; messageId: string };
export type TutorDiscussionSendResult =
  | { ok: true; value: TutorDiscussionTarget }
  | { ok: false; error: "replay_unverified"; value: TutorDiscussionTarget }
  | { ok: false; error: "invalid" | "unavailable" | "rate_limited" | "conflict" | "resolved" | "attachment_expired" | "unknown" };

export type TutorDiscussionDraft = { body: string; requestId: string };

export type TutorSupportReads = {
  schedule(week: number, signal: AbortSignal): Promise<TutorScheduleData>;
  discussions(courseId: string | undefined, search: string, cursor: string | undefined, signal: AbortSignal): Promise<TutorDiscussionList>;
  discussion(courseId: string | undefined, threadId: string, cursor: string | undefined, signal: AbortSignal, targetMessageId?: string): Promise<TutorDiscussionDetail>;
  materials(courseId: string, signal: AbortSignal): Promise<TutorMaterialsData>;
  videos(courseId: string, signal: AbortSignal): Promise<TutorVideosData>;
  live(courseId: string, signal: AbortSignal): Promise<TutorLiveData>;
};

export type TutorSupportClient = TutorSupportReads & {
  playback?(videoId: string, signal: AbortSignal): Promise<string>;
  pendingAnswer?(threadId: string): TutorDiscussionDraft | undefined;
  answer?(courseId: string | undefined, threadId: string, draft: TutorDiscussionDraft, signal: AbortSignal): Promise<TutorDiscussionSendResult>;
};

export function tutorPlaybackUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const youtube = /^youtube\/([A-Za-z0-9_-]{11})$/.exec(value);
  if (youtube) return `https://www.youtube.com/watch?v=${youtube[1]}`;
  if (!value.startsWith("https://") || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

export function parseTutorWeek(value: string | null | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(-520, Math.min(520, Math.trunc(number))) : 0;
}
