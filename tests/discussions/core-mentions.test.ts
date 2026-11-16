import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

let condition: unknown;
const candidates = [{ id: "a", name: "Anita" }, { id: "b", name: "Angela" }, { id: "c", name: "Anwar" }];
const denied = new Set(["c"]);
const roles = new Map<string, "student" | "tutor" | "admin">();
const bodies = new Map([["a", "Belajar limit"], ["b", "Belajar integral"]]);
let candidateLimit = 0, accessIds: string[] = [];
let viewerChecks = 0, revokeViewer = false;
let contextCondition: unknown;
const query = {
 from() { return this; }, innerJoin() { return this; },
 where(value: unknown) { condition = value; return this; },
 orderBy() { return this; }, async limit(limit: number) { candidateLimit = limit; return candidates.slice(0, limit); },
};
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: { select: () => query,
 execute: async (value: unknown) => { contextCondition = value; return { rows: [...bodies].map(([id, body]) => ({ id, body })) }; },
} }));
mock.module("@/lib/discussions/recipient-access", () => ({
 getDiscussionRecipientAccess: async (_channelId: string, ids: string[]) => {
  accessIds = ids;
  return new Map(ids.filter(id => !denied.has(id)).map(id => [id, { id, role: roles.get(id) ?? "student" }]));
 },
}));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}), resolveCourseAccessBatch: async () => new Map() }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined,
 getDiscussionChannelVisibility: async () => ({}),
 getDiscussionActor: async (id: string) => ({ id, role: "student" }),
 getAccessibleDiscussionChannels: async () => [],
 resolveDiscussionCourses: async () => new Map(),
 requireDiscussionMessageAccess: async () => ({}),
 requireDiscussionThreadAccess: async () => ({}),
 requireDiscussionCourse: async () => ({}),
 requireDiscussionChannelAccess: async (actor: { id: string }, channelId: string) => {
  if (channelId === "course" && actor.id === "a" && ++viewerChecks === 2 && revokeViewer) throw new Error("DISCUSSION_UNAVAILABLE");
  if (channelId === "pka") return { id: channelId, kind: "course", courseId: "canonical-pka", legacyCourseId: "tutorial-pka" };
  if (channelId !== "course" || actor.id === "c") throw new Error("DISCUSSION_UNAVAILABLE");
  return { id: channelId };
 },
}));
const { searchChannelMentions } = await import("@/lib/discussions/service");

describe("channel mention search", () => {
 test("filters each candidate by current channel access and exposes names and roles", async () => {
  expect(await searchChannelMentions("a", "course", "An")).toEqual(candidates.slice(0, 2).map(row => ({ ...row, role: "student" })));
  await expect(searchChannelMentions("a", "private", "An")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 });
 test("namesakes receive only nondeleted, nonforwarded context from the authorized channel", async () => {
  const original = candidates.map(row => ({ ...row }));
  candidates[0].name = candidates[1].name = candidates[2].name = "Anita";
  try {
   expect(await searchChannelMentions("a", "course", "An")).toEqual([
    { id: "a", name: "Anita", role: "student", hasNamesake: true, context: "Belajar limit" },
    { id: "b", name: "Anita", role: "student", hasNamesake: true, context: "Belajar integral" },
   ]);
   const compiled = new PgDialect().sqlToQuery(contextCondition as never);
   expect(compiled.params).toContain("course");
   expect(JSON.parse(String(compiled.params[0]))).toEqual(["a", "b"]);
   expect(compiled.sql).toContain("m.deleted_at is null");
   expect(compiled.sql).toContain("<> 'forward'");
  } finally { candidates.forEach((row, index) => Object.assign(row, original[index])); }
 });
 test("detects a same-role and same-context namesake immediately beyond the visible page", async () => {
  const original = candidates.splice(0, candidates.length, ...Array.from({ length: 9 }, (_, index) => ({ id: `other-${index}`, name: `An ${index}` })),
   { id: "a", name: "Anita" }, { id: "b", name: "Anita" });
  bodies.set("b", "  BELAJAR   limit  ");
  try {
   const result = await searchChannelMentions("a", "course", "An");
   expect(result).toHaveLength(11);
   expect(result[9]).toEqual({ id: "a", name: "Anita", role: "student", hasNamesake: true, context: "Belajar limit", ambiguous: true });
   expect(result.some(person => person.id === "b")).toBe(true);
   expect(accessIds).toHaveLength(11);
   bodies.set("b", "Belajar integral");
   expect((await searchChannelMentions("a", "course", "An"))[9]).toEqual({ id: "a", name: "Anita", role: "student", hasNamesake: true, context: "Belajar limit" });
   denied.add("b");
   expect((await searchChannelMentions("a", "course", "An"))[9]).toEqual({ id: "a", name: "Anita", role: "student" });
  } finally {
   denied.delete("b"); bodies.set("b", "Belajar integral"); candidates.splice(0, candidates.length, ...original);
  }
 });
 test("different authorized roles do not cause a collision", async () => {
  const original = candidates[1].name;
  candidates[1].name = candidates[0].name;
  roles.set("b", "tutor");
  try {
   expect(await searchChannelMentions("a", "course", "An")).toEqual([
    { id: "a", name: "Anita", role: "student" }, { id: "b", name: "Anita", role: "tutor" },
   ]);
  } finally { candidates[1].name = original; roles.delete("b"); }
 });
 test("rechecks viewer access after collecting candidates", async () => {
  viewerChecks = 0; revokeViewer = true;
  try { await expect(searchChannelMentions("a", "course", "An")).rejects.toThrow("DISCUSSION_UNAVAILABLE"); }
  finally { revokeViewer = false; viewerChecks = 0; }
 });
 test("fails closed when the matching candidate page exceeds the fixed bound", async () => {
  const original = candidates.splice(0, candidates.length, ...Array.from({ length: 101 }, (_, index) => ({ id: `candidate-${index}`, name: `An ${index}` })));
  try {
   const result = await searchChannelMentions("a", "course", "An");
   expect(candidateLimit).toBe(101);
   expect(accessIds).toHaveLength(100);
   expect(result).toHaveLength(100);
   expect(result.every(person => person.ambiguous === true)).toBe(true);
  } finally { candidates.splice(0, candidates.length, ...original); }
 });
 test("escapes user wildcard characters and keeps candidate reads bounded", async () => {
  await searchChannelMentions("a", "course", "%_");
  const compiled = new PgDialect().sqlToQuery(condition as never);
  expect(compiled.params).toContain("%\\%\\_%");
  expect(compiled.sql).toContain("escape '\\'");
  expect(await searchChannelMentions("a", "course", "x")).toEqual([]);
 });
 test("PKA registration is filtered before the mention limit", async () => {
  await searchChannelMentions("a", "pka", "An");
  const compiled = new PgDialect().sqlToQuery(condition as never);
  expect(compiled.sql).toContain("registration.user_id");
  expect(compiled.sql).toContain("registration.course_id");
  expect(compiled.params).toContain("tutorial-pka");
 });
});
