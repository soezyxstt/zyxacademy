import { describe, expect, mock, test } from "bun:test";
import { DiscussionI18nFixture } from "./discussion-i18n-fixture";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComposerDraft, ComposerSubmission } from "@/components/discussions/composer";
mock.module("@/lib/i18n/actions", () => ({ saveLocaleSelection: async () => ({ success: true }), mirrorResolvedAccountLocaleCookie: async () => {} }));
const { DiscussionComposer, ambiguousDiscussionMention, deliverComposerSubmission, discussionMentionAmbiguityKey, discussionMentions, discussionSendErrorKey, discussionUploadErrorKey, emptyComposerDraft, failedComposerDraft, prepareComposerSubmission, selectDiscussionMention, setComposerReplyTarget } = await import("@/components/discussions/composer");
import { mentionHandle } from "@/components/discussions/discussion-adapter";

const person = { id: "alice-id", name: "Alice", mention: mentionHandle("alice-id", "Alice") };
const viewer = { id: "viewer", name: "Nadia", role: "student" as const };
const noop = async () => {};

describe("discussion composer contract", () => {
  test("identifies namesakes by role or authorized context and blocks unresolved collisions", () => {
    const first = { ...person, role: "student" as const, context: "Saya belajar limit." };
    const second = { ...person, id: "other", role: "student" as const, context: "Saya belajar integral." };
    expect(ambiguousDiscussionMention(first, [first, second])).toBe(false);
    expect(ambiguousDiscussionMention(first, [first, { ...second, context: first.context }])).toBe(true);
    expect(ambiguousDiscussionMention({ ...first, context: null }, [{ ...first, context: null }, { ...second, context: null }])).toBe(true);
    expect(ambiguousDiscussionMention(first, [first, { ...second, role: "tutor", context: first.context }])).toBe(false);
    expect(ambiguousDiscussionMention({ ...first, hasNamesake: true, ambiguous: true }, [first])).toBe(true);
    expect(discussionMentionAmbiguityKey({ ...first, hasNamesake: true, ambiguous: true }, [first])).toBe("mentionIdentityUnavailable");
    expect(discussionMentionAmbiguityKey({ ...first, ambiguous: true }, [first])).toBe("mentionAmbiguous");
    expect(discussionMentionAmbiguityKey(first, [first, { ...second, context: first.context }])).toBe("mentionIdentityUnavailable");
  });

  test("reply target cannot change during send or an unknown outcome", async () => {
    const old = { id: "old", authorName: "Raka", excerpt: "Lama" };
    const next = { id: "new", authorName: "Nadia", excerpt: "Baru" };
    const draft = { ...emptyComposerDraft(), replyTo: old, requestId: "request" };
    expect(setComposerReplyTarget(draft, next)).toMatchObject({ replyTo: next, requestId: undefined });
    for (const locked of [{ ...draft, sending: true }, { ...draft, error: "unknown" as const }]) {
      expect(setComposerReplyTarget(locked, next)).toBe(locked);
      expect(setComposerReplyTarget(locked)).toBe(locked);
    }
    let state: ComposerDraft = { ...draft, body: "Jawaban" };
    const prepared = prepareComposerSubmission(state, viewer, "course", "thread")!;
    await deliverComposerSubmission(prepared, false, change => { state = change(state); }, async () => "unknown");
    state = setComposerReplyTarget(state, next);
    expect(state.replyTo).toEqual(old);
    expect(prepareComposerSubmission(state, viewer, "course", "thread")!.submission).toEqual(prepared.submission);
  });

  test("replays a lost response with the original complete request and cannot silently edit it", async () => {
    let state: ComposerDraft = { ...emptyComposerDraft(), body: "@Zyra bantu", images: [{ id: "image", file: new File(["bytes"], "soal.png", { type: "image/png" }), previewUrl: "blob:image", status: "ready", attachment: { id: "attachment", name: "soal.png", url: "/image" } }] };
    const update = (change: (draft: ComposerDraft) => ComposerDraft) => { state = change(state); };
    const committed = new Map<string, unknown>();
    let first = true;
    const send = async (submission: ComposerSubmission) => {
      if (committed.has(submission.requestId)) expect(committed.get(submission.requestId)).toEqual(submission);
      else committed.set(submission.requestId, submission);
      if (first) { first = false; throw new Error("response lost after commit"); }
    };
    const initial = prepareComposerSubmission(state, viewer, "course", undefined, { title: "Judul", helpKind: "academic" })!;
    expect(initial.submission.askZyra).toBe(true);
    expect(initial.submission.questionDetails).toEqual({ title: "Judul", helpKind: "academic" });
    expect(await deliverComposerSubmission(initial, false, update, send)).toBe(false);
    expect(state.error).toBe("unknown");
    expect(state.pendingSubmission).toEqual(initial.submission);
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={state} update={update} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "unknown" })} onSubmit={noop} submitLabel="Kirim" /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("Status pengiriman belum diketahui");
    expect(html).toContain('data-editor-disabled="true"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Hapus soal.png"|<button[^>]*aria-label="Hapus soal.png"[^>]*disabled/);
    state = { ...state, body: "perubahan yang tidak boleh terkirim" };
    expect(prepareComposerSubmission(state, { ...viewer, id: "other" }, "course")).toBeNull();
    const retry = prepareComposerSubmission(state, viewer, "course", undefined, { title: "Judul lain" })!;
    expect(retry.submission).toEqual(initial.submission);
    expect(await deliverComposerSubmission(retry, true, update, send)).toBe(true);
    expect(committed.size).toBe(1);
    expect(state).toEqual(emptyComposerDraft());
  });

  test("preserves uncertain replay after a controlled failure and makes confirmed expired images retryable", async () => {
    const file = new File(["bytes"], "soal.png", { type: "image/png" });
    let state: ComposerDraft = { ...emptyComposerDraft(), body: "Tanya", images: [{ id: "image", file, previewUrl: "blob:image", status: "ready", attachment: { id: "old", name: "soal.png", url: "/image" } }] };
    const update = (change: (draft: ComposerDraft) => ComposerDraft) => { state = change(state); };
    const prepared = prepareComposerSubmission(state, viewer, "course")!;
    await deliverComposerSubmission(prepared, false, update, async () => "unknown");
    await deliverComposerSubmission(prepareComposerSubmission(state, viewer, "course")!, true, update, async () => "rate_limited");
    expect(state.error).toBe("unknown");
    expect(state.pendingSubmission?.requestId).toBe(prepared.submission.requestId);
    await deliverComposerSubmission(prepareComposerSubmission(state, viewer, "course")!, true, update, async () => "attachment_expired");
    expect(state.error).toBe("attachment_expired");
    expect(state.images[0]).toMatchObject({ file, status: "error", error: "expired" });
    expect(state.images[0].attachment).toBeUndefined();
    expect(state.requestId).toBeUndefined();
    expect(state.pendingSubmission).toBeUndefined();
    state = { ...state, images: [{ ...state.images[0], status: "ready", attachment: { id: "new", name: file.name, url: "/new" } }] };
    const retried = prepareComposerSubmission(state, viewer, "course")!;
    expect(retried.submission.requestId).not.toBe(prepared.submission.requestId);
    expect(retried.submission.attachments.map(attachment => attachment.id)).toEqual(["new"]);
  });

  test("a confirmed resolved replay unlocks the preserved reply without submitting a new request", async () => {
    let state: ComposerDraft = { ...emptyComposerDraft(), body: "Draf balasan", replyTo: { id: "parent", authorName: "Tutor", excerpt: "Konteks" } };
    const update = (change: (draft: ComposerDraft) => ComposerDraft) => { state = change(state); };
    const original = prepareComposerSubmission(state, viewer, "course", "thread")!;
    await deliverComposerSubmission(original, false, update, async () => "unknown");
    const retry = prepareComposerSubmission(state, viewer, "course", "thread")!;
    expect(retry.submission).toEqual(original.submission);
    await deliverComposerSubmission(retry, true, update, async () => "resolved");
    expect(state).toMatchObject({ body: "Draf balasan", replyTo: { id: "parent" }, error: "resolved", sending: false });
    expect(state.pendingSubmission).toBeUndefined();
    expect(state.requestId).toBeUndefined();
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={state} update={update} channelId="course" questionId="thread" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "unknown" })} onSubmit={noop} submitDisabled submitLabel="Kirim" /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("Buang draf");
    expect(html).toContain('data-editor-disabled="false"');
    expect(prepareComposerSubmission(state, viewer, "course", "thread")!.submission.requestId).not.toBe(original.submission.requestId);
  });

  test("legacy replay keeps its exact payload locked until an explicit discard", async () => {
    let state: ComposerDraft = { ...emptyComposerDraft(), body: "Tanya", replyTo: { id: "original", authorName: "Tutor", excerpt: "Konteks" } };
    const update = (change: (draft: ComposerDraft) => ComposerDraft) => { state = change(state); };
    const prepared = prepareComposerSubmission(state, viewer, "course", "thread")!;
    await deliverComposerSubmission(prepared, false, update, async () => "unknown");
    const retry = prepareComposerSubmission(state, viewer, "course", "thread")!;
    await deliverComposerSubmission(retry, true, update, async () => ({ error: "replay_unverified", target: { threadId: "thread", messageId: "message" } }));
    expect(state).toMatchObject({ error: "replay_unverified", pendingSubmission: prepared.submission, replayTarget: { threadId: "thread", messageId: "message" } });
    expect(prepareComposerSubmission(state, viewer, "course", "thread")).toBeNull();
    expect(setComposerReplyTarget(state)).toBe(state);
    for (const locale of ["id", "en"] as const) {
      const html = renderToStaticMarkup(<DiscussionI18nFixture locale={locale}><TooltipProvider><DiscussionComposer draft={state} update={update} channelId="course" questionId="thread" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "unknown" })} onSubmit={noop} submitLabel="Send" /></TooltipProvider></DiscussionI18nFixture>);
      expect(html).toContain('/discussions?thread=thread&amp;message=message');
      expect(html).toContain('target="_blank"');
      expect(html).toContain(locale === "id" ? "terkirim dua kali" : "duplicate");
      expect(html).toContain(locale === "id" ? "Buang draf tertunda" : "Discard pending draft");
      expect(html).toContain('data-editor-disabled="true"');
    }
    expect(failedComposerDraft(state, { error: "replay_unverified", target: { threadId: "", messageId: "message" } }, true).error).toBe("unknown");
  });
  test("keeps explicitly selected IDs across searches and readable same-name mentions", () => {
    const other = selectDiscussionMention({ id: "other-id", name: "Alice", mention: mentionHandle("other-id", "Alice") }, [person]);
    expect(other.mention).toBe("Alice_2");
    expect(discussionMentions(`@${person.mention} @${other.mention} @Zyra`, [person, other]))
      .toEqual({ mentionIds: [person.id, other.id], askZyra: true });
    expect(discussionMentions(`@${person.mention}`, [person, other]).mentionIds).toEqual([person.id]);
    expect(discussionMentions(`@${other.mention}`, [person, other]).mentionIds).toEqual([other.id]);
    expect(discussionMentions(`@${person.mention}`, [person, { ...other, mention: person.mention }]).mentionIds).toEqual([]);
    expect(discussionMentions(`@${person.mention}suffix`, [person]).mentionIds).toEqual([]);
  });

  test("keeps compact upload recovery inline and help available without Zyra text", () => {
    const draft = { ...emptyComposerDraft(), body: "@Zyra bantu", images: [{ id: "image", file: new File(["x"], "discussion-problem.png", { type: "image/png" }), previewUrl: "blob:fixture", status: "error" as const }] };
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={draft} update={() => {}} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "unknown" })} onSubmit={noop} submitLabel="Kirim jawaban" /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("discussion-problem.png");
    expect(html).toContain("Unggah gagal");
    expect(html).toContain("Coba unggah discussion-problem.png lagi");
    expect(html).toContain('aria-label="Bantuan diskusi"');
    expect(html).not.toContain("pesan ini dan kutipan hingga 5 pesan sebelumnya");
    expect(html.indexOf("data-discussion-images")).toBeLessThan(html.indexOf("data-editor-disabled"));
  });

  test("requires an old channel mention to be reselected or removed", () => {
    const draft = { ...emptyComposerDraft(), body: `@${person.mention}`, mentionedPeople: [{ ...person, channelId: "old" }] };
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={draft} update={() => {}} channelId="new" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: true, attachment: { id: "image", name: "image", url: "" } })} onSubmit={noop} submitLabel="Kirim jawaban" /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("Pilih ulang atau hapus orang yang disebut setelah mengganti kanal.");
    expect(html).toMatch(/<button(?=[^>]*disabled)(?=[^>]*aria-label="Kirim jawaban")[^>]*>/);
  });

  test("renders compact reply math instead of exposing Markdown syntax", () => {
    const draft = { ...emptyComposerDraft(), replyTo: { id: "message", authorName: "Tutor", excerpt: "**$x^2$**" } };
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={draft} update={() => {}} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: true, attachment: { id: "image", name: "image", url: "" } })} onSubmit={noop} submitLabel="Kirim balasan" /></TooltipProvider></DiscussionI18nFixture>);
    expect(html).toContain("katex");
    expect(html).not.toContain("**$x^2$**");
    expect(html).toContain("[&amp;_p]:text-body-xs");
  });

  test("retains text, image bytes and request identity on a resolved or unexpected failure", () => {
    const file = new File(["image bytes"], "large.png", { type: "image/png" });
    const draft = { ...emptyComposerDraft(), body: "Jawaban tersimpan", images: [{ id: "image", file, previewUrl: "blob:image", status: "error" as const, error: "pixels" as const }], sending: true, requestId: "request-1", requestFingerprint: "fingerprint" };
    const failed = failedComposerDraft(draft, "resolved");
    expect(failed).toMatchObject({ body: draft.body, sending: false, error: "resolved", requestId: "request-1", requestFingerprint: "fingerprint" });
    expect(failed.images[0].file).toBe(file);
    expect(failedComposerDraft(draft, "SECRET BACKEND ERROR").error).toBe("unknown");
    expect(discussionSendErrorKey("SECRET BACKEND ERROR")).not.toContain("SECRET");
    expect(discussionUploadErrorKey("SECRET BACKEND ERROR")).not.toContain("SECRET");
    const html = renderToStaticMarkup(<DiscussionI18nFixture><TooltipProvider><DiscussionComposer draft={failed} update={() => {}} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "pixels" })} onSubmit={noop} submitDisabled submitLabel="Kirim jawaban" /></TooltipProvider></DiscussionI18nFixture>);
    expect(draft.body).toBe("Jawaban tersimpan");
    expect(html).toContain("Pemilik pertanyaan atau admin dapat membuka kembali");
    expect(html).toContain("4096 piksel per sisi dan 16 juta piksel");
    expect(html).toContain("Hapus large.png");
    expect(html).toContain("Coba unggah large.png lagi");
  });

  test("renders English recovery guidance for safe error keys", () => {
    const draft = { ...emptyComposerDraft(), body: "My draft", error: "resolved" as const, images: [{ id: "image", file: new File(["x"], "large.png", { type: "image/png" }), previewUrl: "blob:image", status: "error" as const, error: "pixels" as const }] };
    const html = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><TooltipProvider><DiscussionComposer draft={draft} update={() => {}} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "pixels" })} onSubmit={noop} submitDisabled submitLabel="Send answer" /></TooltipProvider></DiscussionI18nFixture>);
    expect(draft.body).toBe("My draft");
    expect(html).toContain("The question owner or an admin can reopen it");
    expect(html).toContain("4096 pixels per side and 16 million pixels");
    expect(html).toContain("Remove large.png");
    expect(discussionSendErrorKey("SECRET BACKEND ERROR")).toBe("sendError_unknown");
    expect(discussionUploadErrorKey("SECRET BACKEND ERROR")).toBe("uploadError_unknown");
    const reopened = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><TooltipProvider><DiscussionComposer draft={{ ...draft, images: [] }} update={() => {}} channelId="course" viewer={viewer} onSearchMentions={async () => []} onUpload={async () => ({ ok: false, error: "pixels" })} onSubmit={noop} submitLabel="Send answer" /></TooltipProvider></DiscussionI18nFixture>);
    expect(draft.body).toBe("My draft");
    expect(reopened).toContain("Try sending again");
    expect(reopened).not.toContain("The question owner or an admin can reopen it");
  });
});
