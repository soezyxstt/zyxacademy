import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDiscussionTestDb } from "./local-postgres";

const { client, testDb: db } = await createDiscussionTestDb();
const oldPka = process.env.FEATURE_PKA;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "discussion-test-secret" }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
const { searchChannelMentions } = await import("@/lib/discussions/service");

afterAll(async () => {
 if (oldPka === undefined) delete process.env.FEATURE_PKA;
 else process.env.FEATURE_PKA = oldPka;
 await client.close();
});

beforeAll(async () => {
 await db.insert(schema.peran).values([{ id: "student-role", code: "murid" }, { id: "tutor-role", code: "tutor" }, { id: "admin-role", code: "admin" }]);
 const people = [
  ...Array.from({ length: 9 }, (_, index) => ({ id: `echo-${index}`, name: `Echo 0${index}`, roles: ["student"] })),
  { id: "namesake-10", name: "Echo 09", roles: ["student"] },
  { id: "namesake-11", name: "Echo 09", roles: ["student"] },
  { id: "registered", name: "PKA Registered", roles: ["student"] },
  { id: "unregistered", name: "PKA Unregistered", roles: ["student"] },
  { id: "assigned", name: "PKA Assigned", roles: ["tutor"] },
  { id: "unassigned", name: "PKA Unassigned", roles: ["tutor"] },
  { id: "staff-admin", name: "PKA Admin", roles: ["admin"] },
  { id: "mixed-unassigned", name: "PKA Mixed unassigned", roles: ["tutor", "student"] },
  { id: "mixed-assigned", name: "PKA Mixed assigned", roles: ["tutor", "student"] },
  { id: "mixed-admin", name: "PKA Mixed admin", roles: ["admin", "tutor", "student"] },
  { id: "solo", name: "Solo Person", roles: ["student"] },
  ...Array.from({ length: 101 }, (_, index) => ({ id: `suspended-${index}`, name: "Solo Person", roles: ["student"] })),
 ];
 await db.insert(schema.user).values(people.map(person => ({ id: person.id, name: person.name, email: `${person.id}@example.test` })));
 await db.insert(schema.pengguna).values(people.map(person => ({ id: person.id, status: person.id.startsWith("suspended-") ? "suspended" as const : "active" as const })));
 await db.insert(schema.penggunaPeran).values(people.flatMap(person => person.roles.map(role => ({
  id: `${person.id}-${role}`, penggunaId: person.id, peranId: `${role}-role`, source: "test",
 }))));
 await db.insert(schema.discussionChannels).values({ id: "global", kind: "global", title: "Global" });
 await db.insert(schema.discussionThreads).values({ id: "echo-thread", channelId: "global", authorId: "namesake-10", title: "Echo", nextSeq: 3 });
 await db.insert(schema.discussionMessages).values([
  { id: "echo-message-10", threadId: "echo-thread", authorId: "namesake-10", kind: "human", messageType: "question", body: "Same context", seq: 1, requestId: "echo-request-10" },
  { id: "echo-message-11", threadId: "echo-thread", authorId: "namesake-11", kind: "human", messageType: "answer", body: "  SAME   context ", seq: 2, requestId: "echo-request-11" },
 ]);
 await client.exec(`insert into discussion_thread_participants
  (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
  select thread_id, author_id, 'global', seq, created_at, created_at, seq from discussion_messages where thread_id = 'echo-thread'`);
 await db.insert(schema.courses).values({ id: "tutorial-pka", title: "PKA", category: "TPB" });
 await db.insert(schema.mataKuliah).values({ id: "canonical-pka", code: "PKA", title: "PKA", legacyCourseId: "tutorial-pka", pricingCategory: "free" });
 await db.insert(schema.discussionChannels).values({ id: "pka", kind: "course", title: "PKA", courseId: "canonical-pka", legacyCourseId: "tutorial-pka" });
 await db.insert(schema.enrollments).values([
  { id: "registered-pka", userId: "registered", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") },
  { id: "mixed-unassigned-pka", userId: "mixed-unassigned", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") },
 ]);
 await db.insert(schema.penugasanTutor).values([
  { id: "assigned-pka", penggunaId: "assigned", mataKuliahId: "canonical-pka", status: "active", assignmentScope: "course" },
  { id: "mixed-assigned-pka", penggunaId: "mixed-assigned", mataKuliahId: "canonical-pka", status: "active", assignmentScope: "course" },
 ]);
}, 120_000);

describe("mention search", () => {
 test("namesake context uses participant pointers instead of scanning a long message history", async () => {
  const original = client.query;
  const capturePlan = async () => {
   let statement: { text: string; params: unknown[] } | undefined;
   client.query = function (this: unknown, ...args: Parameters<typeof client.query>) {
    if (/join lateral/i.test(String(args[0])) && /discussion_thread_participants/.test(String(args[0])))
     statement = { text: String(args[0]), params: args[1] as unknown[] };
    return original.apply(this, args);
   } as typeof client.query;
   try { await searchChannelMentions("namesake-10", "global", "Echo"); }
   finally { client.query = original; }
   expect(statement).toBeDefined();
   const result = await client.query(`explain (analyze, buffers, format json) ${statement!.text}`, statement!.params);
   const plan = (result.rows[0] as Record<string, unknown>)["QUERY PLAN"] as { Plan: Record<string, unknown> }[];
   const visits = (node: Record<string, unknown>): number => {
    const own = node["Relation Name"] === "discussion_messages"
     ? (Number(node["Actual Rows"]) + Number(node["Rows Removed by Filter"] ?? 0)) * Number(node["Actual Loops"]) : 0;
    return own + ((node.Plans ?? []) as Record<string, unknown>[]).reduce((sum, child) => sum + visits(child), 0);
   };
   return { visits: visits(plan[0].Plan), plan: plan[0].Plan };
  };
  const short = await capturePlan();
  await client.exec(`insert into discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
   select 'echo-history-' || n, 'echo-thread', 'namesake-10', 'human', 'answer', 'Long unrelated answer', n, 'echo-history-' || n
   from generate_series(3, 10002) n`);
  const long = await capturePlan();
  expect(long.visits).toBeLessThanOrEqual(short.visits + 4);
  expect(long.visits).toBeLessThan(20);
  console.log(JSON.stringify({ namesakeContextMessageVisits: { short: short.visits, long: long.visits }, plan: long.plan }));
 }, 120_000);
 test("finds the authorized namesake at position 11 and only uses same-channel context", async () => {
  const people = await searchChannelMentions("namesake-10", "global", "Echo");
  expect(people).toHaveLength(11);
  expect(people[9]).toMatchObject({ id: "namesake-10", hasNamesake: true, context: "Same context", ambiguous: true });
  expect(people.some(person => person.id === "namesake-11")).toBe(true);
  await db.update(schema.discussionMessages).set({ body: "Different context" }).where(eq(schema.discussionMessages.id, "echo-message-11"));
  try {
   const distinct = await searchChannelMentions("namesake-10", "global", "Echo");
   expect(distinct[9]).toMatchObject({ id: "namesake-10", hasNamesake: true, context: "Same context" });
   expect(distinct[9].ambiguous).toBeUndefined();
  } finally { await db.update(schema.discussionMessages).set({ body: "  SAME   context " }).where(eq(schema.discussionMessages.id, "echo-message-11")); }
  await db.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "namesake-11"));
  try {
   expect((await searchChannelMentions("namesake-10", "global", "Echo"))[9]).toEqual({ id: "namesake-10", name: "Echo 09", role: "student" });
  } finally { await db.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "namesake-11")); }
  expect(await searchChannelMentions("solo", "global", "Solo")).toEqual([{ id: "solo", name: "Solo Person", role: "student" }]);
 });

 test("PKA registration only applies to canonical students, with live staff assignments and feature gate", async () => {
  process.env.FEATURE_PKA = "1";
  const result = await searchChannelMentions("staff-admin", "pka", "PKA");
  expect(Object.fromEntries(result.map(person => [person.id, person.role]))).toEqual({
   assigned: "tutor", "staff-admin": "admin", "mixed-admin": "admin", "mixed-assigned": "tutor", registered: "student",
  });
  expect(JSON.stringify(result)).not.toContain("@example.test");
  await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assigned-pka"));
  try {
   expect((await searchChannelMentions("staff-admin", "pka", "PKA")).some(person => person.id === "assigned")).toBe(false);
  } finally { await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "assigned-pka")); }
  process.env.FEATURE_PKA = "0";
  await expect(searchChannelMentions("staff-admin", "pka", "PKA")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 }, 120_000);
});
