import { expect, test } from "bun:test";
import {
  changeDiscussionDraft, discussionDraftScope, discussionSubmission, emptyDiscussionDraft, readDiscussionDraft,
  type DiscussionDraft,
} from "@/apps/mobile-native/features/student/community/discussion-drafts";
import { DISCUSSION_DRAFT_MAX_ENTRIES, DISCUSSION_DRAFT_TTL_MS } from "@/lib/discussions/draft-policy";

const now = 100_000;
const context = { action: "reply", threadId: "thread", replyTo: "message-a" } as const;
const scope = discussionDraftScope(context, "channel", "skin");
const draft: DiscussionDraft = {
  body: "An equation for @Tutor", title: "", askZyra: true,
  mentions: [{ id: "member", handle: "Tutor" }],
  attachments: [{ id: "receipt", name: "formula.webp", expiresAt: now + 30 }],
};
const pending = { ...draft, pendingId: "original-id", error: "unknown" } as const;

test("restores the exact retry command after the attachment expires and only for its original audience", () => {
  const raw = changeDiscussionDraft(null, scope, undefined, pending, now).value;
  const saved = readDiscussionDraft(raw, scope, now + 31);
  expect(saved).toMatchObject(pending);
  expect(saved?.attachments[0].expiresAt).toBeLessThan(now + 31);
  expect(discussionSubmission(saved!, context, "skin", saved!.pendingId!))
    .toEqual(discussionSubmission(pending, context, "skin", "original-id"));
  expect(readDiscussionDraft(raw, discussionDraftScope({ ...context, replyTo: "message-b" }, "channel", "skin"), now)).toBeNull();
  expect(readDiscussionDraft(raw, discussionDraftScope(context, "other-channel", "skin"), now)).toBeNull();
  expect(readDiscussionDraft(raw, discussionDraftScope(context, "channel", "other-skin"), now)).toBeNull();
  expect(readDiscussionDraft(raw, discussionDraftScope({ action: "answer", threadId: "thread" }, "channel", "skin"), now)).toBeNull();
});

test("persists server recovery status and refuses stale attempts to replace or clear it", () => {
  const raw = changeDiscussionDraft(null, scope, undefined, pending, now).value;
  expect(changeDiscussionDraft(raw, scope, undefined, { ...pending, pendingId: "replacement" }, now).applied).toBe(false);
  const replay: DiscussionDraft = { ...pending, error: "replay_unverified", replayTarget: { threadId: "thread", messageId: "posted" } };
  const saved = changeDiscussionDraft(raw, scope, pending, replay, now).value;
  expect(readDiscussionDraft(saved, scope, now)?.replayTarget?.messageId).toBe("posted");
  expect(changeDiscussionDraft(saved, scope, pending, null, now).applied).toBe(false);
  expect(changeDiscussionDraft(saved, scope, replay, null, now)).toMatchObject({ applied: true, value: null });
  const rejection: DiscussionDraft = { ...draft, error: "attachment_expired", attachments: [{ ...draft.attachments[0], expiresAt: 0 }] };
  const rejected = changeDiscussionDraft(raw, scope, pending, rejection, now).value;
  expect(readDiscussionDraft(rejected, scope, now)).toMatchObject(rejection);
  expect(changeDiscussionDraft(rejected, scope, pending, null, now).applied).toBe(false);
});

test("bounds saved drafts to recent recipients and drops raw or unrelated attachment values", () => {
  const attachment = { ...draft.attachments[0], localUri: "file:///private/attachment", bytes: "encoded-image" };
  let raw = changeDiscussionDraft(null, scope, undefined, { ...draft, attachments: [attachment] }, now).value;
  expect(raw).not.toContain("file://");
  expect(raw).not.toContain("encoded-image");
  expect(readDiscussionDraft(raw, scope, now + DISCUSSION_DRAFT_TTL_MS + 1)).toBeNull();
  expect(readDiscussionDraft(raw, scope, now - 60_001)).toBeNull();
  for (let n = 0; n < DISCUSSION_DRAFT_MAX_ENTRIES; n++) {
    raw = changeDiscussionDraft(raw, discussionDraftScope({ action: "create", channelId: String(n) }, String(n), null),
      undefined, { ...emptyDiscussionDraft(), title: String(n) }, now + n).value;
  }
  expect(JSON.parse(raw!).length).toBe(DISCUSSION_DRAFT_MAX_ENTRIES);
  expect(readDiscussionDraft(raw, scope, now + DISCUSSION_DRAFT_MAX_ENTRIES)).toBeNull();
});
