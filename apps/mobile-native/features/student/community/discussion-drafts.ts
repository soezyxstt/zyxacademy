import type { DiscussionReplayTarget, DiscussionSendError, DiscussionSubmit } from "../../../../../lib/discussions/contracts";
import { DISCUSSION_DRAFT_MAX_ENTRIES, DISCUSSION_DRAFT_TTL_MS } from "../../../../../lib/discussions/draft-policy";

export type DraftContext = { action: "create"; channelId: string } | { action: "answer"; threadId: string }
  | { action: "reply"; threadId: string; replyTo: string };

export type UploadedImage = { id: string; name: string; expiresAt: number };
export type DiscussionDraft = {
  body: string;
  title: string;
  askZyra: boolean;
  attachments: UploadedImage[];
  mentions: { id: string; handle: string }[];
  pendingId?: string;
  error?: DiscussionSendError;
  replayTarget?: DiscussionReplayTarget;
};

const errors: readonly DiscussionSendError[] = [
  "unavailable", "invalid", "rate_limited", "conflict", "resolved", "attachment_expired", "replay_unverified", "unknown",
];
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function emptyDiscussionDraft(): DiscussionDraft {
  return { body: "", title: "", askZyra: false, attachments: [], mentions: [] };
}

export function discussionDraftScope(context: DraftContext, channelId: string, skinId: string | null): string {
  return JSON.stringify([context.action, channelId, skinId, context.action === "create" ? null : context.threadId,
    context.action === "reply" ? context.replyTo : null]);
}

// The editable fields are frozen while pending. Rebuild the same versioned
// command from that snapshot and the same verified destination on every retry.
export function discussionSubmission(draft: DiscussionDraft, context: DraftContext, skinId: string | null, requestId: string) {
  const input: DiscussionSubmit = {
    body: draft.body,
    requestId,
    askZyra: draft.askZyra,
    skinId,
    attachmentIds: draft.attachments.map(image => image.id),
    mentionIds: draft.mentions.map(mention => mention.id),
    mentionHandles: draft.mentions.map(mention => mention.handle),
  };
  return { action: context.action, input: {
    ...input,
    ...(context.action === "create" ? { channelId: context.channelId, title: draft.title.trim() || undefined }
      : { threadId: context.threadId, ...(context.action === "reply" ? { replyTo: context.replyTo } : {}) }),
  } };
}

type Entry = { updatedAt: number; draft: DiscussionDraft };

function decodeDraft(value: unknown): DiscussionDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as DiscussionDraft;
  if (!text(draft.body, 12000) || !text(draft.title, 160) || typeof draft.askZyra !== "boolean"
    || !Array.isArray(draft.attachments) || draft.attachments.length > 4
    || !draft.attachments.every(image => image && id(image.id) && text(image.name, 512) && time(image.expiresAt))
    || !Array.isArray(draft.mentions) || draft.mentions.length > 10
    || !draft.mentions.every(mention => mention && id(mention.id) && text(mention.handle, 64) && /^[\p{L}\p{N}_]+$/u.test(mention.handle))
    || (draft.pendingId !== undefined && !id(draft.pendingId))
    || (draft.error !== undefined && !errors.includes(draft.error))
    || (draft.replayTarget !== undefined && (!draft.pendingId || draft.error !== "replay_unverified"
      || !id(draft.replayTarget?.threadId) || !id(draft.replayTarget?.messageId)))
    || (draft.error === "replay_unverified" && !draft.replayTarget)) return null;
  const { body, title, askZyra, attachments, mentions, pendingId, error, replayTarget } = draft;
  return { body, title, askZyra, attachments: attachments.map(({ id, name, expiresAt }) => ({ id, name, expiresAt })),
    mentions: mentions.map(({ id, handle }) => ({ id, handle })), pendingId, error,
    replayTarget: replayTarget && { threadId: replayTarget.threadId, messageId: replayTarget.messageId } };
}

function entries(raw: string | null, now: number): Map<string, Entry> {
  // Bound parsing even if SQLite has old or malformed data.
  if (!raw || raw.length > 2_500_000) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    const result = new Map<string, Entry>();
    for (const entry of parsed.slice(-DISCUSSION_DRAFT_MAX_ENTRIES)) {
      if (!Array.isArray(entry)) continue;
      const [scope, value] = entry;
      if (!text(scope, 2000) || !time(value?.updatedAt)
        || now - value.updatedAt > DISCUSSION_DRAFT_TTL_MS || value.updatedAt - now > 60_000) continue;
      const draft = decodeDraft(value.draft);
      if (draft) result.set(scope, { updatedAt: value.updatedAt, draft });
    }
    return result;
  } catch {
    return new Map();
  }
}

export function readDiscussionDraft(raw: string | null, scope: string, now = Date.now()): DiscussionDraft | null {
  return entries(raw, now).get(scope)?.draft ?? null;
}

export function changeDiscussionDraft(raw: string | null, scope: string, expected: Pick<DiscussionDraft, "pendingId" | "replayTarget"> | undefined,
  draft: DiscussionDraft | null, now = Date.now()): { value: string | null; applied: boolean; current: DiscussionDraft | null } {
  const saved = entries(raw, now);
  const current = saved.get(scope)?.draft ?? null;
  if (current?.pendingId !== expected?.pendingId || current?.replayTarget?.messageId !== expected?.replayTarget?.messageId) {
    return { value: raw, applied: false, current };
  }
  saved.delete(scope);
  if (draft) {
    const clean = decodeDraft(draft);
    if (!clean) throw new Error("Invalid discussion draft");
    if (clean.body.trim() || clean.title.trim() || clean.askZyra || clean.attachments.length || clean.pendingId || clean.error) {
      saved.set(scope, { updatedAt: now, draft: clean });
    }
  }
  const latest = [...saved].slice(-DISCUSSION_DRAFT_MAX_ENTRIES);
  return { value: latest.length ? JSON.stringify(latest) : null, applied: true, current };
}
