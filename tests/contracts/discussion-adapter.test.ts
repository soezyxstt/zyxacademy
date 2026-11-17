import { describe, expect, mock, test } from "bun:test";
import { advanceObserved, aiStatusKey, beginChannelMetadataRequest, beginPageRequest, canSuggestForwardChannel, channelIdBatches, channelOptionIndex, discussionPrivateQuestionHref, discussionUploadError, discussionViewerState, initialDiscussionMessageCursors, listDiscussionQuestionPage, loadDiscussionChannelMetadata, mentionHandle, mergeById, nextDiscussionMessageCursor, observeDiscussionSnapshot, replyQuote, searchDiscussionChannels, searchDiscussionForwardTargets, searchDiscussionMentions, toQuestion, toUiChannel, visibleDiscussionReadSnapshot } from "@/components/discussions/discussion-adapter";
import type { DiscussionChannel, DiscussionThread } from "@/lib/discussions/contracts";

const channels: DiscussionChannel[] = [
  { id: "global", kind: "global", title: "Umum", courseId: null, muted: false, unreadThreads: 0, activeThreads: 0 },
  { id: "a", kind: "course", title: "A", courseId: "course-a", muted: false, unreadThreads: 0, activeThreads: 0 },
  { id: "b", kind: "course", title: "B", courseId: "course-b", muted: false, unreadThreads: 0, activeThreads: 0 },
  { id: "private", kind: "academic", title: "Tim", courseId: null, muted: false, unreadThreads: 0, activeThreads: 0 },
];
const thread: DiscussionThread = { id: "thread", channelId: "global", title: "Tanya", status: "open", labels: [], helpKind: null, createdAt: "2026-01-01", lastActivityAt: "2026-01-01", answerCount: 0, unreadCount: 1, canReply: true, canResolve: false };

describe("discussion adapter", () => {
  test("requires visible content before preparing even a status-only receipt", () => {
    const state = { through: 5, seen: new Set<number>(), versions: new Map<string, number>() };
    expect(visibleDiscussionReadSnapshot(state, "resolved", [], "receipt")).toBeNull();
    const later = visibleDiscussionReadSnapshot(state, "resolved", [{ id: "later", seq: 7, revision: 1 }], "receipt");
    expect(later?.throughSeq).toBe(5);
    expect(visibleDiscussionReadSnapshot(state, "resolved", [{ id: "other", seq: 8, revision: 1 }], "receipt")?.key).not.toBe(later?.key);
    expect(state.seen.has(7)).toBe(true);
  });

  test("starts at the adjacent report page and returns to the exact target cursor", () => {
    const history = initialDiscussionMessageCursors({ startCursor: "target-450", previousCursor: "prior-420" });
    expect(history).toEqual({ cursors: ["prior-420", "target-450"], index: 1 });
    expect(nextDiscussionMessageCursor(history.cursors, 0, "different-next")).toBe("target-450");
    expect(initialDiscussionMessageCursors({ startCursor: "target-2", previousCursor: "encoded-zero" })).toEqual({ cursors: ["encoded-zero", "target-2"], index: 1 });
    expect(initialDiscussionMessageCursors({ startCursor: "target-450" })).toEqual({ cursors: ["target-450"], index: 0 });
    expect(initialDiscussionMessageCursors({})).toEqual({ cursors: [undefined], index: 0 });
  });
  test("discards the old workspace when the active account changes", () => {
    expect(discussionViewerState("alice", null, true)).toBe("loading");
    expect(discussionViewerState("alice", "alice", false)).toBe("ready");
    expect(discussionViewerState("alice", "bob", false)).toBe("changed");
    expect(discussionViewerState("alice", null, false)).toBe("changed");
  });
  test("limits destinations to authorized audience shapes", () => {
    expect(toQuestion(thread, channels).allowedForwardChannelIds).toEqual(["global", "a", "b"]);
    expect(toQuestion({ ...thread, channelId: "a" }, channels).allowedForwardChannelIds).toEqual(["a"]);
    expect(toQuestion({ ...thread, channelId: "private" }, channels).allowedForwardChannelIds).toEqual([]);
    const alias = { ...channels[1], id: "a-alias" };
    expect(toQuestion({ ...thread, channelId: "a" }, [...channels, alias]).allowedForwardChannelIds).toEqual(["a", "a-alias"]);
    expect(canSuggestForwardChannel(toUiChannel(channels[0]), toUiChannel(channels[1]))).toBe(true);
    expect(canSuggestForwardChannel(toUiChannel(channels[1]), toUiChannel(channels[2]))).toBe(false);
    expect(canSuggestForwardChannel(toUiChannel(channels[1]), toUiChannel(alias))).toBe(true);
    expect(canSuggestForwardChannel(toUiChannel(channels[3]), toUiChannel(channels[3]))).toBe(false);
    expect(canSuggestForwardChannel(toUiChannel(channels[3]), toUiChannel(channels[0]))).toBe(false);
  });
  test("batches channel metadata for the visible thread page, deep link and filter", () => {
    const ids = Array.from({ length: 32 }, (_, index) => `channel-${index}`);
    const batches = channelIdBatches([...ids, ids[0]]);
    expect(batches.map((batch) => batch.length)).toEqual([31, 1]);
    expect(batches.flat()).toEqual(ids);
    expect(channelIdBatches([])).toEqual([]);
    expect(toUiChannel({ ...channels[1], unreadThreads: 3 }).unreadCount).toBe(3);
  });
  test("preserves authorized private audience context without altering channel titles", () => {
    const channel = toUiChannel({ ...channels[3], title: "Tim akademik", courseTitle: "Matematika I", requesterName: "Nadia", isRequester: false });
    expect(channel).toMatchObject({ name: "Tim akademik", courseTitle: "Matematika I", requesterName: "Nadia", isRequester: false });
  });
  test("loads only displayed channel IDs and uses current per-channel counts", async () => {
    const ids = Array.from({ length: 32 }, (_, index) => `channel-${index}`);
    const getChannelsByIds = mock(async (batch: string[]) => batch.includes(ids[31]) ? [{ ...channels[0], id: ids[31], unreadThreads: 4 }] : []);
    const result = await loadDiscussionChannelMetadata({ getChannelsByIds }, ids);
    expect(getChannelsByIds.mock.calls.map(([batch]) => batch.length)).toEqual([31, 1]);
    expect(result.map(toUiChannel)).toEqual([expect.objectContaining({ id: ids[31], unreadCount: 4 })]);
  });
  test("channel and target pickers query one scoped page at a time", async () => {
    const listChannelsPage = mock(async () => ({ items: [channels[1]], nextCursor: "next-channel" }));
    const channelPage = await searchDiscussionChannels({ listChannelsPage }, { search: "Mat", cursor: "channel-cursor", courseId: "other" }, "course-a");
    expect(listChannelsPage).toHaveBeenCalledWith({ search: "Mat", cursor: "channel-cursor", courseId: "course-a", kind: "course", limit: 20 });
    expect(channelPage.items).toHaveLength(1);
    expect(channelPage.nextCursor).toBe("next-channel");
    await searchDiscussionChannels({ listChannelsPage }, { search: "", kinds: ["global", "course"] });
    expect(listChannelsPage).toHaveBeenLastCalledWith({ search: undefined, cursor: undefined, courseId: undefined, kind: undefined, kinds: ["global", "course"], limit: 20 });
    const listThreadsAcrossChannels = mock(async () => ({ items: [thread], nextCursor: "next-thread" }));
    const targets = await searchDiscussionForwardTargets({ listThreadsAcrossChannels }, { channelId: "a", search: "limit", cursor: "thread-cursor" });
    expect(listThreadsAcrossChannels).toHaveBeenCalledWith({ channelId: "a", search: "limit", cursor: "thread-cursor", status: "open" });
    expect(targets).toEqual({ items: [{ questionId: "thread", channelId: "global", title: "Tanya" }], nextCursor: "next-thread" });
  });
  test("loads separate status pages with the same scoped search and cursor", async () => {
    const listThreadsAcrossChannels = mock(async () => ({ items: [thread], nextCursor: "next" }));
    for (const status of ["open", "resolved"] as const) {
      await listDiscussionQuestionPage({ listThreadsAcrossChannels }, { channelId: "a", search: "  limit  ", cursor: `${status}-cursor`, status });
      expect(listThreadsAcrossChannels).toHaveBeenLastCalledWith({ channelId: "a", search: "limit", cursor: `${status}-cursor`, status });
    }
    await listDiscussionQuestionPage({ listThreadsAcrossChannels }, { search: "  ", status: "resolved" });
    expect(listThreadsAcrossChannels).toHaveBeenLastCalledWith({ channelId: undefined, search: undefined, cursor: undefined, status: "resolved" });
  });
  test("opens newly created course questions in the appropriate full workspace", () => {
    expect(discussionPrivateQuestionHref("/courses/math/discussions", "private scope", "thread/1")).toBe("/dashboard/discussions?channel=private+scope&thread=thread%2F1");
    expect(discussionPrivateQuestionHref("/tutor/math/discussions", "private", "thread")).toBe("/tutor/discussions?channel=private&thread=thread");
  });
  test("searches mentions in the active thread or the newly selected channel", async () => {
    const searchMentions = mock(async () => [{ id: "user-a", name: "A", role: "student" as const }]);
    const searchChannelMentions = mock(async () => [{ id: "user-b", name: "B", role: "student" as const, hasNamesake: true, ambiguous: true, context: "Visible context" }]);
    const api = { searchMentions, searchChannelMentions };
    expect(await searchDiscussionMentions(api, { channelId: "channel-a", questionId: "thread-a", query: "Al" })).toEqual([{ id: "user-a", name: "A", role: "student", mention: mentionHandle("user-a", "A") }]);
    expect(await searchDiscussionMentions(api, { channelId: "channel-b", query: "Bo" })).toEqual([{ id: "user-b", name: "B", role: "student", hasNamesake: true, ambiguous: true, context: "Visible context", mention: mentionHandle("user-b", "B") }]);
    expect(searchMentions).toHaveBeenCalledWith("thread-a", "Al");
    expect(searchChannelMentions).toHaveBeenCalledWith("channel-b", "Bo");
  });
  test("moves focus through channel options with arrow, Home and End keys", () => {
    expect(channelOptionIndex("ArrowDown", 0, 3)).toBe(1);
    expect(channelOptionIndex("ArrowUp", 0, 3)).toBe(0);
    expect(channelOptionIndex("End", 0, 3)).toBe(2);
    expect(channelOptionIndex("Home", 2, 3)).toBe(0);
    expect(channelOptionIndex("Enter", 0, 3)).toBeNull();
    expect(channelOptionIndex("ArrowDown", 0, 0)).toBeNull();
  });
  test("uses the server's bounded safe parent quote even when the parent is off page", () => {
    expect(replyQuote({ id: "old", seq: 1, authorName: "Pesan dihapus", excerpt: "Pesan dihapus." })).toEqual({ id: "old", authorName: "Pesan dihapus", excerpt: "Pesan dihapus." });
    expect(replyQuote({ id: "forward", seq: 2, authorName: "A", excerpt: "Pesan asal tidak tersedia." })).toEqual({ id: "forward", authorName: "A", excerpt: "Pesan asal tidak tersedia." });
  });
  test("preserves system quote metadata for localization", () => {
    expect(replyQuote({ id: "old", seq: 1, authorName: "Pesan dihapus", excerpt: "Pesan dihapus.", authorKind: "deleted", excerptKind: "deleted" })).toMatchObject({ authorKind: "deleted", excerptKind: "deleted" });
  });
  test("uses the saved help category instead of an inferred label", () => {
    expect(toQuestion({ ...thread, channelId: "private", labels: ["bug"], helpKind: "academic" }, channels).helpKind).toBe("academic");
  });
  test("merges pages without dropping updates or duplicating IDs", () => {
    expect(mergeById([{ id: "a", value: 1 }, { id: "b", value: 2 }], [{ id: "b", value: 3 }, { id: "c", value: 4 }]))
      .toEqual([{ id: "a", value: 1 }, { id: "b", value: 3 }, { id: "c", value: 4 }]);
  });
  test("keeps identity metadata out of readable mention handles", () => {
    expect(mentionHandle("id-a", "Dina Sari")).toBe("Dina_Sari");
    expect(mentionHandle("id-b", "Dina Sari")).toBe("Dina_Sari");
    expect(mentionHandle("id-a", "Zyra")).toBe("Anggota_Zyra");
    expect(mentionHandle("id-a", "")).toBe("Anggota");
  });
  test("does not advance past a message that was never displayed", () => {
    const seen = new Set([1, 3, 4]);
    expect(advanceObserved(seen, 0)).toBe(1);
    expect([...seen]).toEqual([3, 4]);
    seen.add(2);
    expect(advanceObserved(seen, 1)).toBe(4);
    expect(seen.size).toBe(0);
  });
  test("acknowledges only observed snapshots, including changed revisions and status, without a refresh loop", () => {
    const state = { through: 3, seen: new Set<number>(), versions: new Map<string, number>() };
    const message = { id: "m3", seq: 3, revision: 1 };
    expect(observeDiscussionSnapshot(state, false, "open", [message])).toBeNull();
    expect(state.versions.size).toBe(0);
    expect(observeDiscussionSnapshot(state, true, "open", [])).toBeNull();
    const first = observeDiscussionSnapshot(state, true, "open", [message])!;
    expect(first.throughSeq).toBe(3);
    expect(observeDiscussionSnapshot(state, true, "open", [message])!.key).toBe(first.key);
    const edited = observeDiscussionSnapshot(state, true, "open", [{ ...message, revision: 2 }])!;
    expect(edited.key).not.toBe(first.key);
    const deleted = observeDiscussionSnapshot(state, true, "open", [{ ...message, revision: 3 }])!;
    expect(deleted.key).not.toBe(edited.key);
    expect(observeDiscussionSnapshot(state, true, "resolved", [{ ...message, revision: 3 }])!.key).not.toBe(deleted.key);
    expect(observeDiscussionSnapshot(state, true, "open", [{ id: "m5", seq: 5, revision: 1 }])).toBeNull();
    expect(state.through).toBe(3);
    expect(observeDiscussionSnapshot(state, true, "open", [{ id: "m4", seq: 4, revision: 1 }])!.throughSeq).toBe(5);
  });
  test("accepts only the upload endpoint's controlled messages", () => {
    expect(discussionUploadError("Dimensi gambar maksimal 4096 piksel per sisi dan 16 juta piksel.")).toBe("pixels");
    expect(discussionUploadError("Ukuran gambar maksimal 8 MiB.")).toBe("size");
    expect(discussionUploadError("Gunakan gambar JPEG, PNG, atau WebP yang valid dan tidak bergerak.")).toBe("format");
    expect(discussionUploadError("Terlalu banyak gambar. Coba lagi nanti.")).toBe("rate_limited");
    expect(discussionUploadError("Masuk untuk mengunggah gambar.")).toBe("login");
    expect(discussionUploadError("Gambar tidak dapat diunggah. Periksa akses dan coba lagi.")).toBe("access");
    for (const code of ["pixels", "size", "format", "rate_limited", "login", "access"] as const) expect(discussionUploadError(code)).toBe(code);
    expect(discussionUploadError("SECRET BACKEND ERROR")).toBe("unknown");
    expect(discussionUploadError({ error: "private" })).toBe("unknown");
  });
  test("ignores an older response for a page without discarding other pages", () => {
    const versions = new Map<string, symbol>();
    const first = beginPageRequest(versions);
    const other = beginPageRequest(versions, "cursor");
    const retry = beginPageRequest(versions);
    expect(first()).toBe(false);
    expect(other()).toBe(true);
    expect(retry()).toBe(true);
    versions.clear();
    const afterReset = beginPageRequest(versions);
    expect(retry()).toBe(false);
    expect(afterReset()).toBe(true);
  });
  test("keeps the newer list when refreshes finish out of order", async () => {
    const versions = new Map<string, symbol>();
    let finishFirst!: (value: string) => void;
    let finishSecond!: (value: string) => void;
    let displayed = "";
    const refresh = (promise: Promise<string>) => {
      const current = beginPageRequest(versions);
      return promise.then((value) => { if (current()) displayed = value; });
    };
    const first = refresh(new Promise((resolve) => { finishFirst = resolve; }));
    const second = refresh(new Promise((resolve) => { finishSecond = resolve; }));
    finishSecond("new"); await second;
    finishFirst("old"); await first;
    expect(displayed).toBe("new");
  });
  test("ignores metadata responses after a focus refresh or visible channel change", () => {
    const version = { current: 0 }, key = { current: "page-a" };
    const first = beginChannelMetadataRequest(version, key);
    version.current++;
    expect(first()).toBe(false);
    const refreshed = beginChannelMetadataRequest(version, key);
    expect(refreshed()).toBe(true);
    key.current = "page-b";
    expect(refreshed()).toBe(false);
    expect(beginChannelMetadataRequest(version, key)()).toBe(true);
  });
  test("describes only known AI states and does not echo unknown backend text", () => {
    expect(aiStatusKey("pending")).toBe("ai_pending");
    expect(aiStatusKey("uncertain")).toBe("ai_uncertain");
    expect(aiStatusKey("internal-recovery-envelope")).toBeNull();
    expect(aiStatusKey("failed", "private-backend-error")).toBe("ai_failed");
    expect(aiStatusKey("failed", "ai_quota")).toBe("ai_quota");
  });
});
