import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import { auditMutasi, peran, session, user } from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const actor = { id: "native-provider-admin", sessionId: "native-provider-session" };
let uploadCalls = 0;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => ({ user: { id: actor.id }, session: { id: actor.sessionId } }) }));
mock.module("@/lib/auth/native-operations-admin", () => ({ getNativeOperationsAdmin: async () => ({ ok: true, user: { id: actor.id } }) }));
mock.module("@/lib/storage", () => ({ storage: {
  exists: async key => key === "media/blog/test.pdf",
  getUrl: key => "/api/storage/file/" + key,
  upload: async (file, _name, _type, { key }) => {
    assert.equal(await file.text(), "%PDF-1.7");
    uploadCalls++;
    return { key, size: file.size };
  },
} }));
mock.module("@/app/api/admin/media/route", () => ({ POST: async request => {
  const value = await request.json();
  assert.deepEqual(value, { action: "mkdir", folderPath: "blog/draf" });
  return Response.json({ success: true, key: "media/blog/draf/.keep" });
} }));
mock.module("@/app/api/admin/media/ops/route", () => ({ POST: async request => {
  const value = await request.json();
  if (value.action === "copy") {
    assert.deepEqual(value, { action: "copy", kind: "file", key: "media/blog/test.pdf", targetFolder: "revisi" });
    return Response.json({ success: true, key: "media/revisi/test.pdf" });
  }
  assert.deepEqual(value, { action: "move", kind: "folder", folderPath: "blog/draf", targetFolder: "revisi" });
  return Response.json({ success: true, folderPath: "revisi/draf" });
} }));
mock.module("@/app/api/admin/media/storage/route", () => ({ POST: async request => {
  const value = await request.json();
  assert.deepEqual(value, { action: "copy", kind: "folder", folderPath: "course-assets/source", targetFolder: "revisi" });
  return Response.json({ success: true, folderPath: "revisi/source" });
} }));
mock.module("@/app/api/admin/meet/create/route", () => ({ POST: async request => {
  const value = await request.json();
  assert.deepEqual(value.invitedEmails, ["tutor@example.invalid"]);
  return Response.json({ success: true, space: {
    name: "spaces/local", title: value.title, meetingCode: "loc-alco-dee", meetingUri: "https://meet.google.com/loc-alco-dee",
    invitedEmails: [], slug: value.slug, hostEmail: "admin@example.invalid",
  }, warnings: ["synthetic warning"] });
} }));

mock.module("@/app/api/admin/meet/records/[id]/delete/route", () => ({ DELETE: async () => Response.json({ success: true }) }));
mock.module("@/lib/google-meet", () => ({ getConferenceRecord: async id => {
  if (id === "gone") throw new Error("Google Meet API error (404 Not Found) for synthetic record");
  return { name: `conferenceRecords/${id}`, space: "spaces/local" };
} }));

try {
  const { ensureLegacyIdentity } = await import("../../lib/auth/legacy-identity");
  const { invokeOperationsProvider, nativeProviderMutation } = await import("../../app/api/native/operations/management/provider");
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
  const move = { type: "media.move", key: "media/blog/draf", destination: "media/revisi", folder: true };
  assert.deepEqual(await apply("placeholder-media-move", move), { id: "media/revisi/draf" });
  assert.deepEqual(await apply("placeholder-media-move", move, () => assert.fail("provider replay")), { id: "media/revisi/draf" });
  assert.deepEqual(await apply("placeholder-media-copy", { type: "media.copy", key: "media/blog/test.pdf", destination: "media/revisi", folder: false }),
    { id: "media/revisi/test.pdf" });
  assert.deepEqual(await apply("placeholder-storage-copy", { type: "media.copy", key: "course-assets/source", destination: "media/revisi", folder: true }),
    { id: "media/revisi/source" });
  const { POST: filePost } = await import("../../app/api/native/operations/management/media/route");
  const { NextRequest } = await import("next/server");
  function replaceFile({ sessionId = actor.sessionId, initiator = origin, contents = "%PDF-1.7", target = "media/blog/test.pdf" } = {}) {
    const form = new FormData();
    form.append("action", "replace");
    form.append("file", new File([contents], "test.pdf", { type: "application/pdf" }));
    form.append("key", target);
    return filePost(new NextRequest(origin + "/api/native/operations/management/media", { method: "POST", body: form,
      headers: { Origin: initiator, "x-native-operations-user-id": actor.id, "x-native-operations-session-id": sessionId,
        "x-native-operations-request-key": "placeholder-media-replace",
      },
    }));
  }
  assert.equal((await replaceFile({ initiator: "https://outside.invalid" })).status, 403);
  assert.equal((await replaceFile({ sessionId: "other-session" })).status, 403);
  assert.equal((await replaceFile({ target: "private/test.pdf" })).status, 400);
  const replacement = await replaceFile();
  assert.equal(replacement.status, 200);
  assert.deepEqual(await replacement.json(), { id: "media/blog/test.pdf" });
  assert.equal((await replaceFile()).status, 200);
  assert.equal((await replaceFile({ contents: "%PDF-1.4 changed" })).status, 409);
  assert.equal(uploadCalls, 1);
  const meet = { type: "meet.create", title: "Latihan", slug: "latihan", accessType: "OPEN", invitedEmails: ["Tutor@Example.Invalid", "tutor@example.invalid"] };
  const meeting = await apply("placeholder-meet-create", meet);
  assert.equal(meeting.warningCount, 1);
  assert.equal(meeting.space.name, "spaces/local");
  assert.equal(meeting.space.hostEmail, "admin@example.invalid");
  assert.equal(meeting.space.meetingUri, "https://meet.google.com/loc-alco-dee");
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
  const drive = { type: "meet.sync-drive", id: "conference-local" };
  const driveResult = { id: drive.id, meetDriveSync: { status: "complete", synchronized: 2, pending: 0 } };
  await assert.rejects(apply("placeholder-drive-sync", drive, async () => { throw new Error("receipt interrupted"); }), { code: "uncertain" });
  assert.deepEqual(await apply("placeholder-drive-sync", drive, async () => driveResult), driveResult);
  assert.deepEqual(await apply("placeholder-drive-sync", drive, async () => assert.fail("completed Drive replay")), driveResult);
  await assert.rejects(apply("placeholder-drive-invalid", { ...drive, emails: ["untrusted@example.invalid"] }, () => assert.fail("invalid input invoked")));
  assert.equal((await testDb.select().from(auditMutasi)).length, 10);
  await testDb.delete(session).where(eq(session.id, actor.sessionId));
  await assert.rejects(apply("placeholder-meet-create", meet, () => assert.fail("expired session")), { code: "forbidden" });
  console.log("Mocked provider dispatch, partial warning, pending, uncertain, replay and session revocation checks passed");
} finally {
  await client.close();
}
