import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";

const { client, testDb } = await createPostgresTestDb();
const sentEvents: Array<{ name: string; data: Record<string, unknown> }> = [];
let failSend = false;

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/jobs/client", () => ({
  inngest: {
    send: async (event: { name: string; data: Record<string, unknown> }) => {
      if (failSend) throw new Error("queue unavailable");
      sentEvents.push(event);
      return { ids: ["mock-id"] };
    },
  },
}));

const { triggerGoogleCalendarSyncForScheduleChange } = await import(
  "@/lib/google-calendar/trigger"
);

afterAll(() => client.close());

test("enqueues sync only for connected calendar users in affected group/tutor and deduplicates pending targets", async () => {
  await testDb.insert(schema.user).values([
    { id: "student-connected", email: "sc@example.test", name: "SC", role: "student" },
    { id: "student-unconnected", email: "su@example.test", name: "SU", role: "student" },
    { id: "tutor-connected", email: "tc@example.test", name: "TC", role: "teacher" },
  ]);
  await testDb.insert(schema.groups).values({ id: "group-1", name: "Group 1" });
  await testDb.insert(schema.groupMembers).values([
    { id: "gm-1", groupId: "group-1", userId: "student-connected", role: "leader" },
    { id: "gm-2", groupId: "group-1", userId: "student-unconnected", role: "member" },
  ]);
  await testDb.insert(schema.account).values([
    {
      id: "acc-1",
      accountId: "g-sc",
      providerId: "google",
      userId: "student-connected",
      scope: "openid,email,https://www.googleapis.com/auth/calendar.events",
      refreshToken: "rt-1",
    },
    {
      id: "acc-2",
      accountId: "g-su",
      providerId: "google",
      userId: "student-unconnected",
      scope: "openid,email",
      refreshToken: "rt-2",
    },
    {
      id: "acc-3",
      accountId: "g-tc",
      providerId: "google",
      userId: "tutor-connected",
      scope: "https://www.googleapis.com/auth/calendar.events",
      refreshToken: "rt-3",
    },
  ]);

  sentEvents.length = 0;
  const first = await triggerGoogleCalendarSyncForScheduleChange({
    userIds: ["tutor-connected"],
    groupIds: ["group-1"],
    includeCentral: false,
  });

  expect(first.sort()).toEqual(["user:student-connected", "user:tutor-connected"]);
  expect(sentEvents.map((e) => e.data.target).sort()).toEqual([
    "user:student-connected",
    "user:tutor-connected",
  ]);

  // Immediate repeat should be deduplicated while requestedAt is recent
  sentEvents.length = 0;
  const second = await triggerGoogleCalendarSyncForScheduleChange({
    userIds: ["tutor-connected"],
    groupIds: ["group-1"],
    includeCentral: false,
  });
  expect(second).toEqual([]);
  expect(sentEvents).toHaveLength(0);
});

test("swallows queue failures so schedule mutations never fail", async () => {
  failSend = true;
  await testDb.delete(schema.googleCalendarSync);
  const enqueued = await triggerGoogleCalendarSyncForScheduleChange({
    userIds: ["tutor-connected"],
    includeCentral: false,
  });
  expect(enqueued).toEqual([]);
  failSend = false;
});
