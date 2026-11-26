import { expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import { discussionWorkspaceReads } from "@/components/discussions/discussion-adapter";
import { invalidateDiscussionThreadLists } from "@/lib/discussions/workspace-query";
import { createQueryClient, syncQueryAccount } from "@/lib/query/client";
import { studentTodayQuery } from "@/lib/student/today-query";

test("mocked online Dashboard to Discussion tab revisits share reads and observe mutation and access changes", async () => {
  const client = createQueryClient();
  const original = globalThis.fetch;
  const requests: string[] = [];
  let title = "Before mutation";
  globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const headers = new Headers(init?.headers);
    requests.push(`${headers.get("x-student-id")}:${path.split("?")[0]}`);
    expect(init?.cache).toBe("no-store");
    return Response.json(path.includes("/today")
      ? { streak: { current: 0, longest: 0 }, items: [] }
      : { nextCursor: null, items: [{
        id: "thread", channelId: "classroom", title, status: "open", labels: [], helpKind: null,
        createdAt: "2026-11-01", lastActivityAt: "2026-11-01", answerCount: 0, unreadCount: 0,
        canReply: true, canResolve: false,
      }] });
  }, { preconnect: original.preconnect }) as typeof fetch;

  function visitDiscussion(userId = "a", sessionId = "session-a", locale = "id", channelIds = ["classroom"], revision = channelIds.join(",")) {
    return discussionWorkspaceReads(userId, { client, scope: { sessionId, channelIds, revision }, locale })
      .listThreadsAcrossChannels({ status: "open" });
  }

  try {
    syncQueryAccount(client, "a");
    const today = studentTodayQuery("a");
    const sidebar = new QueryObserver(client, today).subscribe(() => {});
    await client.fetchQuery(today);
    const dashboard = new QueryObserver(client, today).subscribe(() => {});
    dashboard();
    await visitDiscussion();
    const revisitedDashboard = new QueryObserver(client, today).subscribe(() => {});
    revisitedDashboard();
    await visitDiscussion();
    expect(requests).toEqual(["a:/api/student/today", "a:/api/discussions/workspace"]);

    title = "After mutation";
    invalidateDiscussionThreadLists(client, "a");
    expect((await visitDiscussion()).items[0]?.title).toBe(title);
    expect(requests).toHaveLength(3);

    await visitDiscussion("a", "session-new");
    await visitDiscussion("a", "session-new", "en");
    await visitDiscussion("a", "session-new", "en", ["global"]);
    await visitDiscussion("a", "session-new", "en", ["classroom"], "new-channel-revision");
    expect(requests).toHaveLength(7);
    sidebar();
    syncQueryAccount(client, "b");
    await expect(visitDiscussion()).rejects.toThrow("account changed");
    await visitDiscussion("b", "session-b");
    expect(requests.at(-1)).toBe("b:/api/discussions/workspace");
    syncQueryAccount(client, null);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    globalThis.fetch = original;
    client.clear();
  }
});
