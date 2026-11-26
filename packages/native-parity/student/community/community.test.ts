import { expect, test } from "bun:test";
import { operationsCatalog } from "../../../../lib/admin-mcp/operations-catalog";
import { communityRoutes } from "./contracts";
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
  const empty = createCommunityFixtureRequest("empty");
  expect((await empty(base + "course-ranking?id=matematika-1")).status).toBe(403);
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

test("learner community operations have an explicit MCP catalog exclusion", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/student/community/[operation]/route.ts");
  expect(entry).toMatchObject({ actions: ["GET", "POST"], tools: [], status: "excluded" });
});
