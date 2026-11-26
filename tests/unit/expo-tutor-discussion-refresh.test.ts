import { expect, test } from "bun:test";
import type { TutorDiscussionDetail, TutorDiscussThread } from "../../packages/academic/tutor-support";
import { appendTutorList, extendTutorThread, initialTutorThread, readbackTutorThread, refreshTutorList, refreshTutorThread,
  tutorDiscussionWindowPages, tutorListView, tutorThreadView } from "../../apps/mobile-native/features/academic/tutor/discussion-window";
import { listRefreshDelay, threadRefreshDelay } from "../../apps/mobile-native/features/student/community/discussion-refresh";

const freshSignal = () => new AbortController().signal;

function thread(id: string, status: TutorDiscussThread["status"] = "open"): TutorDiscussThread {
  return { id, status, title: id, answerCount: 0, canReply: status === "open" };
}

const message = (id: string, seq: number, body = id, revision = 1): TutorDiscussionDetail["messages"]["items"][number] =>
  ({ id, seq, body, revision, author: "Other actor", attachmentCount: 0, messageType: "reply", bodyKind: body ? "body" : "deleted" });

function detail(receipt: string, items: TutorDiscussionDetail["messages"]["items"], paging: Partial<TutorDiscussionDetail["messages"]> = {},
  status: "open" | "resolved" = "open"): TutorDiscussionDetail {
  return { thread: thread("discussion", status), messages: { items, nextCursor: null, ...paging },
    observed: { receipt, throughSeq: 0, items: items.map(({ id, seq }) => ({ id, seq })) } };
}

test("a new actor question, resolution and deletion replace a loaded list using fresh cursors", async () => {
  const before = {
    pages: [
      { items: [thread("resolved-by-author"), thread("deleted-by-moderator")], nextCursor: "before-change" },
      { items: [thread("retained"), thread("older")], nextCursor: "still-older" },
    ],
  };
  const calls: (string | undefined)[] = [];
  const result = await refreshTutorList(before, async cursor => {
    calls.push(cursor);
    if (!cursor) return { items: [thread("new-actor-question"), thread("retained")], nextCursor: "from-retained" };
    return { items: [thread("retained"), thread("older", "open")], nextCursor: "older-after-change" };
  }, freshSignal());
  expect(tutorListView(result).items.map(item => item.id)).toEqual(["new-actor-question", "retained", "older"]);
  expect(tutorListView(result).nextCursor).toBe("older-after-change");
  expect(calls).toEqual([undefined, "from-retained"]);
  let bounded = result;
  for (let index = 0; index < 6; index++) {
    bounded = appendTutorList(bounded, "page-" + index, { items: [thread("more-" + index)], nextCursor: "next" });
    expect(bounded.pages.length).toBeLessThanOrEqual(tutorDiscussionWindowPages);
  }
  expect(bounded.start).toBeDefined();
});

test("anchored thread refresh retains older pages, replaces edited or deleted rows and picks up replies and resolution", async () => {
  const older = detail("older-before", [message("early", 1)], { nextCursor: "at-target" });
  const anchor = detail("anchor-before", [message("target", 2), message("edited", 3)], { startCursor: "at-target", previousCursor: "older" });
  const anchored = initialTutorThread(anchor, { target: "target" });
  const current = extendTutorThread(anchored, "older", older, true);
  const calls: Array<{ cursor?: string; target?: string }> = [];
  const result = await refreshTutorThread(current, async locator => {
    calls.push(locator);
    if (locator.cursor === "older") return detail("older-after", [message("early", 1, "", 2)], { nextCursor: "at-target" }, "resolved");
    if (locator.cursor === "at-target") return detail("anchor-after", [message("target", 2), message("edited", 3, "Edited elsewhere", 2)], {
      previousCursor: "older", nextCursor: "at-new-reply",
    }, "resolved");
    return detail("reply-after", [message("actor-reply", 4)], { previousCursor: "at-target" }, "resolved");
  }, freshSignal());
  const view = tutorThreadView(result);
  expect(calls).toEqual([{ cursor: "older" }, { cursor: "at-target" }, { cursor: "at-new-reply" }]);
  expect(view.thread.status).toBe("resolved");
  expect(view.messages.items.map(item => [item.id, item.body, item.revision])).toEqual([
    ["early", "", 2], ["target", "target", 1], ["edited", "Edited elsewhere", 2], ["actor-reply", "actor-reply", 1],
  ]);
  expect(view.readPages.map(page => [page.receipt, page.status, page.items.map(item => item.id)])).toEqual([
    ["older-after", "resolved", ["early"]], ["anchor-after", "resolved", ["target", "edited"]], ["reply-after", "resolved", ["actor-reply"]],
  ]);
});

test("readback refreshes admitted rows and their receipts without appending unvisited or duplicate pages", () => {
  const start = initialTutorThread(detail("start", [message("one", 1), message("two", 2)], { nextCursor: "page-2" }), {});
  const result = readbackTutorThread(start, detail("new-revision", [message("two", 2, "Fixed", 2), message("outside", 3)]), "two");
  const view = tutorThreadView(result);
  expect(view.messages.nextCursor).toBe("page-2");
  expect(view.messages.items.map(({ id }) => id)).toEqual(["one", "two"]);
  expect(view.readPages.map(page => [page.receipt, page.items.map(item => [item.id, item.revision])])).toEqual([
    ["start", [["one", 1]]], ["new-revision", [["two", 2]]],
  ]);
  const ownNewReply = readbackTutorThread(start, detail("reply", [message("own-new", 80)], { startCursor: "start-80", previousCursor: "prior-window" }), "own-new");
  expect(tutorThreadView(ownNewReply).messages.previousCursor).toBe("prior-window");
  expect(ownNewReply.pages[0]?.locator).toEqual({ cursor: "start-80" });
});

test("switching route aborts an outstanding window refresh and reads never advance the stale cursor", async () => {
  const controller = new AbortController();
  const pending = { pages: [{ items: [thread("before")], nextCursor: "before" }, { items: [], nextCursor: null }] };
  const calls: (string | undefined)[] = [];
  await expect(refreshTutorList(pending, async cursor => {
    calls.push(cursor);
    controller.abort();
    return { items: [thread("stale")], nextCursor: "stale-next" };
  }, controller.signal)).rejects.toThrow("cancelled");
  expect(calls).toEqual([undefined]);
  expect(listRefreshDelay()).toBe(120_000);
  expect(threadRefreshDelay({ aiStatuses: [] })).toBe(60_000);
  expect(threadRefreshDelay({ aiStatuses: [{ status: "pending", reason: null }] })).toBe(4_000);
});
