import assert from "node:assert/strict";
import { mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPostgresTestDb } from "../helpers/postgres";
import {
  user,
  emailNotificationPreferences,
  pricingSettings,
} from "../../db/schema";
const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/env", () => ({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: "" } }));
mock.module("@/lib/auth-secret", () => ({
  resolveAuthSecret: () => "synthetic-local-" + salt,
}));
const salt = randomUUID();
const post = (body) =>
  new Request("https://example.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
try {
  const { POST: unsubscribe } = await import(
    "../../app/api/native/public/unsubscribe/route"
  );
  const { POST: plans } = await import(
    "../../app/api/native/public/plans/route"
  );
  const { createEmailUnsubscribeToken } = await import(
    "../../lib/email-preferences/token"
  );
  for (const id of ["review-a", "review-b"])
    await testDb
      .insert(user)
      .values({
        id,
        name: id,
        email: id + "@example.invalid",
        role: "student",
      });
  const tok = (userId, category, nowMs) =>
    createEmailUnsubscribeToken({ userId, category, nowMs });
  const A = tok("review-a", "course_updates");
  for (const body of [
    { token: A, intent: "inspect" },
    { token: tok("review-b", "news_and_offers"), intent: "inspect" },
  ]) {
    const r = await unsubscribe(post(body));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(await r.json()), ["category"]);
    assert.match(r.headers.get("cache-control"), /no-store/);
  }
  for (const body of [
    { token: "bad", intent: "confirm" },
    { token: A, intent: "wrong" },
    { token: tok("review-a", "course_updates", 0), intent: "inspect" },
    { token: A, intent: "confirm", category: "news_and_offers" },
  ])
    assert.equal((await unsubscribe(post(body))).status, 404);
  assert.equal(
    (await testDb.select().from(emailNotificationPreferences)).length,
    0,
  );
  for (let i = 0; i < 2; i++) {
    const r = await unsubscribe(post({ token: A, intent: "confirm" }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { category: "course_updates" });
  }
  const rows = await testDb.select().from(emailNotificationPreferences);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "review-a");
  assert.equal(rows[0].courseUpdates, false);
  assert.equal(rows[0].eventsAndSchedules, true);
  const wants = {
    people: 2,
    subjects: ["Matematika I"],
    otherSubjects: 0,
    locale: "id",
  };
  for (const tweak of [
    { people: 0 },
    { people: 99 },
    { otherSubjects: 8 },
    { subjects: [] },
    { subjects: ["unknown"] },
    { subjects: ["Matematika I", "Matematika I"] },
    { locale: "de" },
    { discount: 80 },
  ])
    assert.equal((await plans(post({ ...wants, ...tweak }))).status, 400);
  for (const locale of ["en", "id"]) {
    const r = await plans(post({ ...wants, locale }));
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.quotes.length, 5);
    assert.equal(data.quotes.find((q) => q.key === "free").price, 0);
  }
  assert.equal((await testDb.select().from(pricingSettings)).length, 0);
  console.log(
    "unsubscribe: 8 HTTP responses, inspection and invalid input had zero DB mutations, repeat confirmation affected one account and one category; public plans: 10 HTTP responses, bounded quotation no DB mutations.",
  );
} finally {
  await client.close();
}
