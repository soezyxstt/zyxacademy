import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";
import * as schema from "@/db/schema";
import type { BroadcastDraft } from "@/packages/academic/admin-broadcast";

const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database }));
mock.module("@/db", () => ({ db: database }));
const delivered: string[][] = [];
let interruptAfterSend = false;
mock.module("@/lib/notifications/send", () => ({
  sendAdminBroadcast: async (_title: string, _body: string, _link: string, ids: string[]) => {
    delivered.push(ids);
    if (interruptAfterSend) throw new Error("Provider result unavailable");
    return { attempted: ids.length, succeeded: ids.length, failedTokens: [], errors: [] };
  },
}));

const fixtureOrigin = "http://localhost:3100";
function setFixtureOrigin(origin: string) {
  process.env.BETTER_AUTH_URL = origin;
  process.env.NEXT_PUBLIC_APP_URL = origin;
}
setFixtureOrigin(fixtureOrigin);
process.env.QUEUE_PROVIDER = "noop";
const {
  collectNativeBroadcasts, prepareNativeBroadcast, processNativeBroadcast, readNativeBroadcast, transitionNativeBroadcast,
} = await import("@/lib/native/academic/administration/broadcast-service");
const { collectAdminOperations, processAdminOperation } = await import("@/lib/admin-mcp/external-jobs");

const actor = { user: { id: "admin" }, session: { id: "admin-session" } };
const otherAdmin = { user: { id: "other-admin" }, session: { id: "other-session" } };
const learner = { user: { id: "student" }, session: { id: "student-session" } };
const draft: BroadcastDraft = { title: "Schedule", body: "Check the new time.", link: "/dashboard", target: "user", targetId: learner.user.id };
async function addUser(id: string) {
  await database.insert(schema.user).values({ id, email: `${id}@example.test`, name: id });
}

beforeAll(async () => {
  for (const viewer of [actor, otherAdmin, learner]) {
    await addUser(viewer.user.id);
    if (viewer !== learner) {
      await seedAdminMcpAuthority(database, {
        userId: viewer.user.id, sessionId: viewer.session.id, actorId: viewer.user.id, scopes: [], authMethod: "session",
      });
    }
  }
  // The native Admin role comes from active memberships even when the legacy role differs.
  await database.update(schema.user).set({ role: "student" }).where(eq(schema.user.id, actor.user.id));
  await database.insert(schema.session).values({
    id: learner.session.id, userId: learner.user.id, token: "student-fixture", expiresAt: new Date("2099-01-01"),
  });
});
beforeEach(async () => {
  // A failed assertion must not leave a queued operation or provider call count for a later case.
  await database.delete(schema.adminOperationJobs);
  delivered.length = 0;
  interruptAfterSend = false;
});
afterAll(async () => { await client.close(); });

test("preparation is recoverable, recipients stay private, and only the same admin session can queue it", async () => {
  const id = crypto.randomUUID();
  const prepared = await prepareNativeBroadcast(actor, id, draft);
  expect(prepared.status).toBe("prepared");
  expect(prepared.recipientCount).toBe(1);
  expect(prepared).not.toHaveProperty("recipientIds");
  expect(await prepareNativeBroadcast(actor, id, draft)).toEqual(prepared);
  expect((await readNativeBroadcast(actor)).receipt).toEqual(prepared);
  expect((await readNativeBroadcast(otherAdmin)).receipt).toBeNull();
  expect(await collectNativeBroadcasts()).toEqual([]);
  await expect(prepareNativeBroadcast(actor, id, { ...draft, title: "Different" })).rejects.toThrow("REQUEST_CONFLICT");
  await expect(transitionNativeBroadcast(otherAdmin, id, "confirm")).rejects.toThrow("NOT_FOUND");
  await expect(transitionNativeBroadcast({ user: actor.user, session: otherAdmin.session }, id, "confirm")).rejects.toThrow("UNAUTHENTICATED");
  await expect(prepareNativeBroadcast(learner, id, draft)).rejects.toThrow("FORBIDDEN");
  expect((await transitionNativeBroadcast(actor, id, "confirm")).status).toBe("queued");
  expect((await transitionNativeBroadcast(actor, id, "confirm")).status).toBe("queued");
  expect(await collectNativeBroadcasts()).toEqual([{ id }]);
  expect(await collectAdminOperations()).toEqual([]);
  expect((await processAdminOperation(id, async () => { throw new Error("unexpected MCP claim"); })).claimed).toBe(false);
  const claims = await Promise.all([processNativeBroadcast(id), processNativeBroadcast(id)]);
  expect(claims.filter(claim => claim.claimed)).toHaveLength(1);
  expect(delivered).toEqual([[learner.user.id]]);
  expect((await readNativeBroadcast(actor)).receipt).toMatchObject({ status: "succeeded", recipientCount: 1, succeeded: 1 });
});

test("audience changes before and after confirmation require new review", async () => {
  const all = { ...draft, target: "all" as const, targetId: "" };
  for (const timing of ["before", "after"]) {
    const id = crypto.randomUUID();
    const prepared = await prepareNativeBroadcast(actor, id, all);
    if (timing === "after") expect((await transitionNativeBroadcast(actor, id, "confirm")).status).toBe("queued");
    // Equal counts with changed membership must still invalidate the snapshot.
    await addUser(`incoming-${timing}`);
    if (timing === "after") await database.delete(schema.user).where(eq(schema.user.id, "incoming-before"));
    if (timing === "before") expect((await transitionNativeBroadcast(actor, id, "confirm")).issue).toBe("audience_changed");
    else expect((await processNativeBroadcast(id)).claimed).toBe(false);
    expect((await readNativeBroadcast(actor)).receipt).toMatchObject({ issue: "audience_changed", recipientCount: prepared.recipientCount });
  }
  expect(delivered).toHaveLength(0);
});

test("an interrupted provider result remains uncertain and is never replayed", async () => {
  const id = crypto.randomUUID();
  await prepareNativeBroadcast(actor, id, draft);
  await transitionNativeBroadcast(actor, id, "confirm");
  interruptAfterSend = true;
  try { await processNativeBroadcast(id); } finally { interruptAfterSend = false; }
  expect((await transitionNativeBroadcast(actor, id, "confirm")).status).toBe("unknown");
  expect((await processNativeBroadcast(id)).claimed).toBe(false);
  expect(delivered).toHaveLength(1);
});

test("the worker fails closed when the origin or Admin session changes", async () => {
  const id = crypto.randomUUID();
  await prepareNativeBroadcast(actor, id, draft);
  await transitionNativeBroadcast(actor, id, "confirm");
  try {
    setFixtureOrigin("http://localhost:3101");
    expect((await processNativeBroadcast(id)).claimed).toBe(false);
  } finally { setFixtureOrigin(fixtureOrigin); }
  await database.delete(schema.session).where(eq(schema.session.id, actor.session.id));
  expect((await processNativeBroadcast(id)).claimed).toBe(false);
  const [stored] = await database.select().from(schema.adminOperationJobs).where(eq(schema.adminOperationJobs.id, id));
  expect(stored).toMatchObject({ status: "failed", errorCode: "authorization_expired" });
  expect(delivered).toHaveLength(0);
});
