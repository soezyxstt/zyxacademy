import { expect, test } from "bun:test";
import { operationsCatalog } from "../../../../lib/admin-mcp/operations-catalog";
import { describeAgendaEvent, groupCalendarEvents } from "../../../../lib/student/agenda-presentation";
import { createStudentFixtureRequest } from "../fixture-request";
import { calendarEvidence } from "./calendar-fixture";
import { summarizeCourseLeaderboard } from "../../../../lib/student/course-leaderboard";
import { communityRoutes, type AgendaData, type CourseRanking } from "./contracts";
import { createCommunityFixtureRequest, isCommunityFixturePath } from "./fixtures";
import { communityCases, studentCommunityAlias } from "./routes";

const base = "/api/native/student/community/";

test("community aliases preserve repeatable parameters and replace the academic tab", () => {
  expect(studentCommunityAlias("/discussions", "/discussions/?thread=one&message=two")).toBe("/dashboard/discussions?thread=one&message=two");
  const academic = new URL(studentCommunityAlias("/leaderboard/academic", "/leaderboard/academic?tab=rank&course=course-1&scope=global&custom=a&custom=b")!, "https://test.invalid");
  expect(academic.pathname).toBe("/leaderboard");
  expect(academic.searchParams.get("tab")).toBe("academic");
  expect(academic.searchParams.get("course")).toBe("course-1");
  expect(academic.searchParams.get("scope")).toBe("global");
  expect(academic.searchParams.getAll("custom")).toEqual(["a", "b"]);
  expect(studentCommunityAlias("/settings/notifications", "/settings/notifications")).toBe(null);
});

test("community fixture cases cover all routes in three states, with one route ID per case", () => {
  expect(communityRoutes).toHaveLength(19);
  expect(communityCases).toHaveLength(57);
  expect(new Set(communityCases.map(item => item.id)).size).toBe(57);
  expect(isCommunityFixturePath("/api/discussions/workspace?view=threads")).toBe(true);
  expect(isCommunityFixturePath("/api/discussions/workspace-override")).toBe(false);
});

test("academic ranking, participation, and profile privacy keep distinct fixture projections", async () => {
  const request = createCommunityFixtureRequest();
  const academic = await (await request(base + "academic-ranking?course=matematika-1")).json();
  const participation = await (await request(base + "participation-ranking")).json();
  const publicProfile = await (await request(base + "public-profile?id=nara-putri")).json();
  expect(academic.boards[0].rows[0]).toMatchObject({ average: 94.5, attempts: 4 });
  expect(academic.boards[0].rows[0]).not.toHaveProperty("studentId");
  expect(participation.entries[0]).toMatchObject({ baseXpMicro: 165_000_000, publicId: "nara-putri" });
  expect(participation.entries[0]).not.toHaveProperty("average");
  expect(publicProfile.baseXpMicro).toBeNull();
  expect(publicProfile).not.toHaveProperty("email");
});

test("course ranking uses only podium rows and a rank summary, with empty and locked states", async () => {
  const ranks = ["first", "second", "third", "hidden", "viewer"].map((studentId, index) => ({ studentId, rank: index + 1 }));
  expect(summarizeCourseLeaderboard(ranks, "viewer")).toEqual({ topRows: ranks.slice(0, 3), ownRank: 5, totalStudents: 5 });
  expect(summarizeCourseLeaderboard(ranks, "unranked").ownRank).toBeNull();
  const request = createCommunityFixtureRequest();
  const path = base + "course-ranking?id=matematika-1";
  const ranking = await (await request(path)).json() as CourseRanking;
  expect(ranking).toMatchObject({ assessment: "quiz", ownRank: 5, totalStudents: 5 });
  expect(ranking.rows.map(row => row.rank)).toEqual([1, 2, 3]);
  expect(ranking.rows[0]).toMatchObject({ average: 94.5, attempts: 4, averageDurationSeconds: 132, correctHardCount: 3, attemptedMediumCount: 6 });
  const simulation = await (await request(path + "&type=simulation")).json() as CourseRanking;
  expect(simulation).toMatchObject({ assessment: "simulation", ownRank: null, totalStudents: 0, rows: [] });
  const locked = await createCommunityFixtureRequest("empty")(path);
  expect(locked.status).toBe(403);
  expect(await locked.json()).toEqual({ code: "forbidden" });
});

test("community fixture recovery is scoped to its own transport and retry keeps discussion IDs", async () => {
  const request = createCommunityFixtureRequest("unavailable");
  await expect(request(base + "discussion-scope")).rejects.toThrow("Network request failed");
  expect((await request(base + "discussion-scope")).status).toBe(200);
  const init = { method: "POST", body: JSON.stringify({ action: "create", input: { channelId: "channel-general", requestId: "deterministic-request", body: "Bagaimana membandingkan dua pecahan?" } }) };
  const first = await (await request(base + "discussion", init)).json();
  expect(first.ok).toBe(true);
  expect(await (await request(base + "discussion", init)).json()).toEqual(first);
  const existing = await (await request("/api/discussions/workspace?view=threads&channelId=channel-general")).json();
  expect(existing.items).toHaveLength(1);
  const anotherSession = createCommunityFixtureRequest();
  const isolated = await (await anotherSession("/api/discussions/workspace?view=threads&channelId=channel-general")).json();
  expect(isolated.items).toHaveLength(0);
});

test("a selected discussion alias can post and reopen one scoped answer", async () => {
  const pathname = studentCommunityAlias("/discussions", "/discussions?channel=channel-math&thread=thread-limit&message=message-limit")!;
  const route = new URL(pathname, "https://student.fixture.invalid");
  const workspace = `/api/discussions/workspace?view=thread&threadId=${route.searchParams.get("thread")}`;
  const request = createCommunityFixtureRequest();
  const selected = await (await request(`${workspace}&messageId=${route.searchParams.get("message")}`, { method: "POST" })).json();
  expect(selected.thread).toMatchObject({ channelId: route.searchParams.get("channel"), answerCount: 0 });
  expect(selected.messages.items).toMatchObject([{ id: "message-limit", messageType: "question" }]);

  const body = "Periksa nilai dari kedua sisi titik sambung.";
  const init = { method: "POST", body: JSON.stringify({ action: "answer", input: {
    threadId: selected.thread.id, requestId: "scope-answer", body, askZyra: false, attachmentIds: [], mentionIds: [],
  } }) };
  const sent = await (await request(base + "discussion", init)).json();
  expect(sent).toMatchObject({ ok: true, value: { threadId: selected.thread.id } });
  expect(await (await request(base + "discussion", init)).json()).toEqual(sent);
  const send = JSON.parse(init.body);
  for (const conflict of [{ ...send, input: { ...send.input, body: "Jawaban berbeda." } },
    { action: "reply", input: { ...send.input, replyTo: "message-limit" } }]) {
    const result = await request(base + "discussion", { method: "POST", body: JSON.stringify(conflict) });
    expect(await result.json()).toEqual({ ok: false, error: "conflict" });
  }

  const reopened = await (await request(`${workspace}&messageId=${sent.value.messageId}`, { method: "POST" })).json();
  expect(reopened.thread).toMatchObject({ answerCount: 1 });
  expect(reopened.messages.items).toMatchObject([
    { id: "message-limit", messageType: "question" },
    { id: sent.value.messageId, threadId: selected.thread.id, messageType: "answer", body },
  ]);
});

test("discussion replies and forwards retain scoped references after the original answer is deleted", async () => {
  const request = createCommunityFixtureRequest();
  const post = async (body: object) => request(base + "discussion", { method: "POST", body: JSON.stringify(body) });
  const view = async (threadId: string) => (await request(`/api/discussions/workspace?view=thread&threadId=${threadId}`)).json();
  const draft = { threadId: "thread-limit", attachmentIds: [], mentionIds: [], askZyra: false };
  const answer = await (await post({ action: "answer", input: { ...draft, body: "Jawaban awal.", requestId: "answer-1" } })).json();
  const reply = await (await post({ action: "reply", input: { ...draft, body: "Balasan.", requestId: "reply-1", replyTo: answer.value.messageId } })).json();
  const input = { action: "forward", threadId: draft.threadId, messageId: answer.value.messageId, requestId: "forward-1" };
  const forward = await (await post(input)).json();
  expect(reply.ok).toBe(true);
  expect(forward.ok).toBe(true);
  expect(await (await post(input)).json()).toEqual(forward);
  expect(await (await post({ ...input, messageId: "message-limit" })).json()).toEqual({ ok: false, error: "conflict" });
  const publicThread = await (await post({ action: "create", input: {
    channelId: "channel-general", requestId: "create-global", body: "Pertanyaan umum.",
  } })).json();
  expect(await (await post({ ...input, threadId: publicThread.value.threadId, requestId: "forward-global" })).json()).toEqual({ ok: false, error: "unavailable" });
  const store = await view(draft.threadId);
  expect(store.thread.answerCount).toBe(1);
  expect(store.messages.items).toMatchObject([
    { id: "message-limit" },
    { id: answer.value.messageId, messageType: "answer" },
    { id: reply.value.messageId, messageType: "reply", replyTo: { id: answer.value.messageId, seq: 2, authorName: "Aruni Rasyid", excerpt: "Jawaban awal." } },
    { id: forward.value.messageId, messageType: "forward", body: "Jawaban awal.", forwardedFrom: { id: answer.value.messageId, threadId: draft.threadId } },
  ]);
  const deleteInput = { action: "delete", messageId: answer.value.messageId };
  expect((await post(deleteInput)).ok).toBe(true);
  expect((await post(deleteInput)).ok).toBe(false);
  const reopened = await view(draft.threadId);
  expect(reopened.thread.answerCount).toBe(0);
  expect(reopened.messages.items).toMatchObject([
    { id: "message-limit" },
    { id: answer.value.messageId, bodyKind: "deleted", canDelete: false, revision: 1 },
    { id: reply.value.messageId, replyTo: { id: answer.value.messageId, excerptKind: "deleted", excerpt: "Pesan dihapus." } },
    { id: forward.value.messageId, bodyKind: "source_unavailable", forwardedFrom: null, canReply: false },
  ]);
});

test("schedule recovery fails the primary read even when sync status starts first", async () => {
  const request = createCommunityFixtureRequest("unavailable");
  const [sync, schedule] = await Promise.allSettled([
    request(base + "calendar-status"), request(base + "schedule?offset=0"),
  ]);
  expect(sync.status).toBe("fulfilled");
  expect(schedule.status).toBe("rejected");
  expect((await request(base + "schedule?offset=0")).status).toBe(200);
});

test("learner community operations have an explicit MCP catalog exclusion", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/student/community/[operation]/route.ts");
  expect(entry).toMatchObject({ actions: ["GET", "POST"], tools: [], status: "excluded" });
});

test("calendar evidence uses Jakarta days and preserves category reset data", async () => {
  for (const state of Object.values(calendarEvidence.states)) {
    const request = createStudentFixtureRequest(state.scenario);
    const response = await request(base + "calendar");
    const data: AgendaData = await response.json();
    expect(response.status).toBe(200);
    expect(data.sync).toBeNull();
    const { active, past } = groupCalendarEvents(data.events, state.category);
    const list = [...active, ...past].flatMap(group => group.events);
    expect(list.map(event => event.id)).toEqual([...state.eventIds]);
    if (state.category === "all") {
      expect(active.map(group => group.day)).toEqual(["2030-01-02"]);
      expect(past.map(group => group.day)).toEqual(["2030-01-01"]);
      expect(describeAgendaEvent(active[0].events[0], "id")).toEqual({
        actionLabel: "doQuiz", quietAction: false, timeLabel: { key: "deadline", values: { time: "00.30" } },
      });
    }
    if (state.eventIds.length === 0) {
      expect(groupCalendarEvents(data.events, "all").active[0].events).toHaveLength(2);
    }
  }
});
