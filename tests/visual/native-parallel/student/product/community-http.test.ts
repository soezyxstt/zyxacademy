import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { inArray } from "drizzle-orm";
import { Client } from "pg";
import {
  courses, enrollments, gamificationLeaderboardPeriods, gamificationProfiles, mataKuliah, pengguna, penggunaPeran,
  quizTemplates, session, studentQuizAttempts, user,
} from "../../../../../db/schema";
import { membershipIdFor } from "../../../../../lib/auth/peran";
import type { AcademicRanking, AgendaData, CourseRanking, LeaderboardPage, Profile, PublicStudentProfile } from "../../../../../packages/native-parity/student/community/contracts";
import { localStudentCookie } from "./session";

const http = process.env.STUDENT_COMMUNITY_HTTP_BASE;
const key = "community-test-" + randomUUID().slice(0, 8);
const ids = { enrolled: key + "-learner", peer: key + "-peer", dual: key + "-dual", active: key + "-active", archived: key + "-archived" };
const publicId = key + "-display";
const users = [ids.enrolled, ids.peer, ids.dual];
const tokens = new Map<string, string>();
let client: Client | undefined;

async function request(path: string, actor?: string, payload?: unknown, account = actor): Promise<Response> {
  const secret = process.env.BETTER_AUTH_SECRET;
  const headers = new Headers();
  if (actor) {
    const token = tokens.get(actor);
    const credentials = token && secret
      ? { name: "better-auth.session_token", value: encodeURIComponent(token + "." + await makeSignature(token, secret)) }
      : await localStudentCookie("revoked");
    headers.set("Cookie", `${credentials.name}=${credentials.value}`);
    headers.set("x-student-id", account!);
  }
  if (payload !== undefined) headers.set("Content-Type", "application/json");
  return fetch(new URL(`/api/native/student/community/${path}`, http), {
    headers, redirect: "manual", method: payload === undefined ? "GET" : "POST",
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(150_000),
  });
}

describe.skipIf(!http)("Next native community against disposable local PostgreSQL", () => {
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "");
    const origin = new URL(http!);
    if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/student_evidence" ||
        !["127.0.0.1", "localhost"].includes(origin.hostname) || !process.env.BETTER_AUTH_SECRET) throw new Error("Expected the local Student evidence fixture");
    client = new Client({ connectionString: database.href });
    await client.connect();
    await drizzle(client).transaction(async tx => {
      const expiresAt = new Date(Date.now() + 3600_000);
      for (const id of users) {
        const name = id === ids.peer ? "Nara for native community" : "Synthetic native community";
        const token = randomUUID();
        tokens.set(id, token);
        await tx.insert(user).values({ id, name, email: id + "@example.invalid", faculty: "FMIPA", major: "Matematika", role: "student" });
        await tx.insert(pengguna).values({ id, status: "active" });
        const roles = id === ids.dual ? ["murid", "tutor"] as const : ["murid"] as const;
        await tx.insert(penggunaPeran).values(roles.map(role => ({
          id: membershipIdFor(id, role), penggunaId: id, peranId: "peran-" + role, source: "better_auth_user_create",
        })));
        await tx.insert(session).values({ id, userId: id, token, expiresAt });
      }
      for (const id of [ids.active, ids.archived]) {
        const title = id === ids.active ? "Native community math" : "Archived math";
        await tx.insert(courses).values({ id, title, category: "Matematika" });
        await tx.insert(mataKuliah).values({ id: id + "-canonical", code: id, legacyCourseId: id, title, status: id === ids.active ? "active" : "archived" });
        await tx.insert(enrollments).values({ id, userId: ids.enrolled, courseId: id, expiresAt });
        await tx.insert(quizTemplates).values({ id, title, courseId: id, category: "chapter", status: "published", selectionRules: {}, closeAt: new Date(Date.now() + 86_400_000) });
        await tx.insert(studentQuizAttempts).values({ id, studentId: ids.peer, templateId: id, score: 93, durationSeconds: 120, status: "completed", questionsSnapshot: [], answersSnapshot: {} });
      }
      await tx.insert(gamificationProfiles).values({
        userId: ids.peer, publicId, visibility: "members", showFaculty: true, showMajor: false, leaderboardOptIn: true,
      });
      await tx.insert(gamificationLeaderboardPeriods).values({ userId: ids.peer, periodKey: "all", baseXpMicro: 542_000_000 });
    });
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    try {
      await drizzle(client).transaction(async tx => {
        await tx.delete(enrollments).where(inArray(enrollments.courseId, [ids.active, ids.archived]));
        await tx.delete(mataKuliah).where(inArray(mataKuliah.id, [ids.active + "-canonical", ids.archived + "-canonical"]));
        await tx.delete(courses).where(inArray(courses.id, [ids.active, ids.archived]));
        await tx.delete(pengguna).where(inArray(pengguna.id, users));
        await tx.delete(user).where(inArray(user.id, users));
      });
    } finally {
      await client.end();
    }
  }, 30_000);

  test("the request guard authenticates the learner, checks account binding and rejects dual-role discussion actors", async () => {
    expect((await request("profile")).status).toBe(401);
    expect((await request("profile", ids.enrolled, undefined, ids.peer)).status).toBe(409);
    expect((await request("discussion-scope", ids.dual)).status).toBe(403);
    expect((await request("discussion", ids.dual, { action: "mute", channelId: "test", muted: true })).status).toBe(403);
  }, 180_000);

  test("per-course academic access filters inactive and unenrolled courses, with privacy-safe score rows", async () => {
    const allowed = await request("academic-ranking?course=" + ids.active + "-canonical", ids.enrolled);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    const result = await allowed.json() as AcademicRanking;
    expect(result.courses.map(course => course.id)).toEqual([ids.active]);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].rows[0]).toMatchObject({ average: 93, attempts: 1, identity: { publicId } });
    expect(result.boards[0].rows[0]).not.toHaveProperty("studentId");
    expect(result.boards[0].rows[0]).not.toHaveProperty("questionsSnapshot");
    expect((await request("course-ranking?id=" + ids.active, ids.peer)).status).toBe(403);
    expect((await request("course-ranking?id=matematika-1", "student-evidence-revoked")).status).toBe(403);
    const course = await request("course-ranking?id=" + ids.active + "&type=simulation", ids.enrolled);
    expect(course.status).toBe(200);
    const simulations = await course.json() as CourseRanking;
    expect(simulations.assessment).toBe("simulation");
    expect(simulations.rows).toHaveLength(0);
    const calendar = await request("calendar", ids.enrolled);
    expect(calendar.status).toBe(200);
    const agenda = await calendar.json() as AgendaData;
    expect(agenda.events.some(event => event.id === "quiz-" + ids.active)).toBe(true);
    expect(agenda.events.some(event => event.id === "quiz-" + ids.archived)).toBe(false);
  }, 90_000);

  test("global and following participation use opt-in XP, separate from course scores and private profile fields", async () => {
    const global = await request("participation-ranking?period=all&scope=global", ids.enrolled);
    expect(global.status).toBe(200);
    const ranking = await global.json() as LeaderboardPage;
    const participant = ranking.entries.find(entry => entry.publicId === publicId);
    expect(participant).toMatchObject({ baseXpMicro: 542_000_000 });
    expect(participant).not.toHaveProperty("average");
    const following = await (await request("participation-ranking?period=all&scope=following", ids.enrolled)).json() as LeaderboardPage;
    expect(following.entries.some(entry => entry.publicId === publicId)).toBe(false);
    expect((await request("participation-ranking?period=all&scope=invalid", ids.enrolled)).status).toBe(400);
    const own = await (await request("profile", ids.enrolled)).json() as Profile;
    expect(own.account.email).toBe(ids.enrolled + "@example.invalid");
    const peer = await (await request("public-profile?id=" + publicId, ids.enrolled)).json() as PublicStudentProfile;
    expect(peer).toMatchObject({ publicId, faculty: "FMIPA", major: null });
    expect(peer).not.toHaveProperty("email");
    expect(peer).not.toHaveProperty("studentId");
    expect((await request("social", ids.enrolled, { id: publicId, action: "block" })).status).toBe(200);
    expect((await request("public-profile?id=" + publicId, ids.enrolled)).status).toBe(404);
  }, 90_000);
});
