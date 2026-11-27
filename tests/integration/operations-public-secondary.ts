// Run in a dedicated Bun process because the local environment uses module overrides.
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { emailNotificationPreferences, user } from "../../db/schema";

const { client, testDb } = await createPostgresTestDb();
process.env.BETTER_AUTH_SECRET = "native-operations-local-fixture-secret";
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/env", () => ({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: "6280000000000", FEATURE_LIVE: "0" } }));

try {
  const { POST: publicPlan } = await import("../../app/api/native/public/plans/route");
  const { POST: unsubscribe } = await import("../../app/api/native/public/unsubscribe/route");
  const { createEmailUnsubscribeToken } = await import("../../lib/email-preferences/token");
  const { getPricingDiscounts } = await import("../../lib/pricing-settings");
  const { getPlanPriceQuote } = await import("../../lib/pricing-constants");
  const post = (path: string, body: object) => new Request(`http://localhost${path}`, {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
  const plan = (body: object) => publicPlan(post("/api/native/public/plans", body));
  const input = { people: 3, subjects: ["Matematika I"], otherSubjects: 1, locale: "en" };
  const quote = await plan(input);
  assert.equal(quote.status, 200);
  assert.equal(quote.headers.get("cache-control"), "no-store");
  const data = await quote.json();
  assert.equal(data.quotes.length, 5);
  const { contactUrl, ...minimal } = data.quotes.find((item: { key: string }) => item.key === "minimal");
  assert.deepEqual(minimal, { key: "minimal", ...getPlanPriceQuote("minimal", 3, 2, undefined, await getPricingDiscounts()) });
  const contact = new URL(contactUrl);
  assert.equal(contact.hostname, "wa.me");
  assert.match(contact.searchParams.get("text") ?? "", /Matematika I, Other course/i);
  for (const invalid of [
    { people: 0 }, { people: 6 }, { subjects: ["not a supported course"] },
    { subjects: ["Matematika I", "Matematika I"] }, { otherSubjects: 5 },
    { subjects: [], otherSubjects: 0 }, { locale: "fr" }, { admin: true },
  ]) assert.equal((await plan({ ...input, ...invalid })).status, 400);

  const preference = (body: object) => unsubscribe(post("/api/native/public/unsubscribe", body));
  const userId = "operations-email-fixture";
  await testDb.insert(user).values({ id: userId, name: "Public test", email: "operations@example.test" });
  const token = createEmailUnsubscribeToken({ userId, category: "course_updates" });
  const second = createEmailUnsubscribeToken({ userId, category: "learning_reminders" });
  const expired = createEmailUnsubscribeToken({ userId, category: "learning_reminders", nowMs: 0 });
  const inspection = await preference({ token, intent: "inspect" });
  assert.equal(inspection.status, 200);
  assert.equal(inspection.headers.get("cache-control"), "no-store");
  assert.deepEqual(await inspection.json(), { category: "course_updates" });
  assert.equal((await testDb.select().from(emailNotificationPreferences)).length, 0);
  for (const invalid of [expired, "damaged", `${token}damaged`]) {
    assert.equal((await preference({ token: invalid, intent: "confirm" })).status, 404);
  }
  const confirmations = await Promise.all([
    preference({ token, intent: "confirm" }),
    preference({ token: second, intent: "confirm" }),
  ]);
  assert.ok(confirmations.every(({ status }) => status === 200));
  assert.equal((await preference({ token, intent: "confirm" })).status, 200);
  const [stored] = await testDb.select().from(emailNotificationPreferences);
  assert.deepEqual({
    emailEnabled: stored.emailEnabled,
    courseUpdates: stored.courseUpdates,
    eventsAndSchedules: stored.eventsAndSchedules,
    learningReminders: stored.learningReminders,
    newsAndOffers: stored.newsAndOffers,
  }, { emailEnabled: true, courseUpdates: false, eventsAndSchedules: true, learningReminders: false, newsAndOffers: false });
  console.log("operations public secondary: quotes, input limits, token inspection and concurrent confirmation passed");
} finally {
  await client.close();
}
