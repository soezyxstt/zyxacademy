import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import { auditMutasi, peran, session, user } from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/app/api/admin/media/route", () => ({ POST: async request => {
  const value = await request.json();
  assert.deepEqual(value, { action: "mkdir", folderPath: "blog/draf" });
  return Response.json({ success: true, key: "media/blog/draf/.keep" });
} }));
mock.module("@/app/api/admin/meet/create/route", () => ({ POST: async request => {
  const value = await request.json();
  assert.deepEqual(value.invitedEmails, ["tutor@example.invalid"]);
  return Response.json({ success: true, space: { name: "spaces/local", title: value.title, meetingCode: "loc-alco-dee", invitedEmails: [], slug: value.slug }, warnings: ["synthetic warning"] });
} }));

mock.module("@/app/api/admin/meet/records/[id]/delete/route", () => ({ DELETE: async () => Response.json({ success: true }) }));
mock.module("@/lib/google-meet", () => ({ getConferenceRecord: async id => {
  if (id === "gone") throw new Error("Google Meet API error (404 Not Found) for synthetic record");
  return { name: `conferenceRecords/${id}`, space: "spaces/local" };
} }));

try {
  const { ensureLegacyIdentity } = await import("../../lib/auth/legacy-identity");
  const { invokeOperationsProvider, nativeProviderMutation } = await import("../../app/api/native/operations/management/provider");
  const actor = { id: "native-provider-admin", sessionId: "native-provider-session" };
  await testDb.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  await testDb.insert(user).values({ id: actor.id, name: "Admin", email: "admin@example.invalid", role: "admin" });
  await ensureLegacyIdentity(actor.id);
  await testDb.insert(session).values({ id: actor.sessionId, userId: actor.id, token: "synthetic-provider-session", expiresAt: new Date("2099-01-01T00:00:00Z") });
  const origin = "https://native-fixture.example.invalid";
  const invoke = invokeOperationsProvider(origin, new Headers({ "Content-Type": "application/json" }));
  const apply = (key, action, run = invoke) => nativeProviderMutation(actor, origin, key, action, run);
  const folder = { type: "media.folder", folder: "media/blog", name: "draf" };
  assert.deepEqual(await apply("placeholder-media-mkdir", folder), { id: "media/blog/draf/.keep" });
  assert.deepEqual(await apply("placeholder-media-mkdir", folder, () => assert.fail("provider replay")), { id: "media/blog/draf/.keep" });
  const meet = { type: "meet.create", title: "Latihan", slug: "latihan", accessType: "OPEN", invitedEmails: ["Tutor@Example.Invalid", "tutor@example.invalid"] };
  const meeting = await apply("placeholder-meet-create", meet);
  assert.equal(meeting.warningCount, 1);
  assert.equal(meeting.space.name, "spaces/local");
  assert.deepEqual(await apply("placeholder-meet-create", meet, () => assert.fail("provider replay")), meeting);

  let finish;
  let claimed;
  const invoked = new Promise(resolve => { claimed = resolve; });
  const end = { type: "meet.end", spaceName: "spaces/local" };
  const running = apply("placeholder-meet-end", end, () => {
    claimed();
    return new Promise((_, reject) => { finish = reject; });
  });
  const outcome = assert.rejects(running, { code: "uncertain" });
  await invoked;
  await assert.rejects(apply("placeholder-meet-end", end, () => assert.fail("second execution")), { code: "pending" });
  finish(new Error("synthetic timeout after dispatch"));
  await outcome;
  await assert.rejects(apply("placeholder-meet-end", end, () => assert.fail("unknown execution")), { code: "uncertain" });
  await assert.rejects(apply("fresh-key-meet-end", end, () => assert.fail("unknown replay with new identity")), { code: "uncertain" });
  const record = await apply("placeholder-deleted-meet", { type: "meet.delete", id: "gone" });
  assert.deepEqual(record, { id: "gone" });
  await assert.rejects(apply("placeholder-remaining-meet", { type: "meet.delete", id: "still" }), { code: "uncertain" });
  assert.equal((await testDb.select().from(auditMutasi)).length, 5);
  await testDb.delete(session).where(eq(session.id, actor.sessionId));
  await assert.rejects(apply("placeholder-meet-create", meet, () => assert.fail("expired session")), { code: "forbidden" });
  console.log("Mocked provider dispatch, partial warning, pending, uncertain, replay and session revocation checks passed");
} finally {
  await client.close();
}
