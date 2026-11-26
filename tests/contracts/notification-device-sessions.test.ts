import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { MulticastMessage } from "firebase-admin/messaging";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { session, userPushTokens } from "@/db/schema";

const token = (id: string) => id.padEnd(80, "_");
const payload = { title: "Notice", body: "Update", type: "announcement" as const };
let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
let registration: typeof import("@/app/api/notifications/register-token/route");
let status: typeof import("@/app/api/notifications/status/route");
let sessions: typeof import("@/app/api/account/sessions/route");
let sender: typeof import("@/lib/notifications/send");
let active = { user: { id: "owner" }, session: { id: "phone" } };
const deliveries: string[] = [];
const messages: MulticastMessage[] = [];
const revoked: string[] = [];

function req(path: string, method = "GET", body?: object) {
  return new NextRequest("https://staging.zyxacademy.com" + path, {
    method, headers: { "Content-Type": "application/json", cookie: "session=fake" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function add(id: string, sessionId: string | null, platform: "web" | "android" = "android", userId = "owner") {
  await testDb.insert(userPushTokens).values({
    id, userId, sessionId, token: token(id), platform,
    transport: platform === "web" ? "webpush" : "fcm",
  });
}

beforeAll(async () => {
  client = await PGlite.create();
  await client.exec(`
    create table "user" (id text primary key);
    create table "session" (id text primary key, token text not null unique, user_id text not null references "user"(id),
      expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      ip_address text, user_agent text);
    create table user_push_tokens (id text primary key, user_id text not null references "user"(id), token text not null unique,
      device text not null default 'unknown', platform text not null default 'web', transport text not null default 'fcm',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table notifications (id text primary key);
    insert into "user" values ('owner'), ('other');
  `);
  await client.exec(readFileSync("drizzle-postgres/0045_native_notification_delivery.sql", "utf8"));
  testDb = drizzle(client);
  mock.module("@/db", () => ({ db: testDb }));
  mock.module("@/lib/auth", () => ({
    auth: { api: {
      getSession: async () => active,
      revokeSession: async ({ body }: { body: { token: string } }) => {
        revoked.push(body.token);
        await testDb.delete(session).where(eq(session.token, body.token));
        return { status: true };
      },
    } },
  }));
  mock.module("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=fake" }) }));
  mock.module("@/lib/firebase/admin", () => ({
    isFirebaseAdminConfigured: () => true,
    adminMessaging: () => ({ sendEachForMulticast: async (message: MulticastMessage) => {
      messages.push(message);
      deliveries.push(...message.tokens);
      return { responses: message.tokens.map(() => ({ success: true })) };
    } }),
  }));
  mock.module("@/lib/notifications/apns", () => ({
    isApnsConfigured: () => true,
    getExpoIosApnsConfig: (environment: string) => environment === "development" ? {} : null,
    sendApnsNotifications: async () => ({ succeeded: 0, failedTokens: [], errors: [] }),
  }));
  mock.module("@/lib/i18n/preferences", () => ({ getUserLocalePreference: async () => "en" }));
  mock.module("@/lib/notifications/quiet-delivery", () => ({
    deferQuietPushes: async () => new Set<string>(),
    deferredSendResult: () => ({ attempted: 0, succeeded: 0, failedTokens: [], errors: [] }),
  }));
  registration = await import("@/app/api/notifications/register-token/route");
  status = await import("@/app/api/notifications/status/route");
  sessions = await import("@/app/api/account/sessions/route");
  sender = await import("@/lib/notifications/send");
});
beforeEach(async () => {
  await client.exec(`truncate user_push_tokens, "session";
    insert into "session" (id,token,user_id,expires_at) values
    ('phone','phone-session-secret','owner',now()+interval '1 day'),
    ('laptop','laptop-session-secret','owner',now()+interval '1 day'),
    ('expired','expired-session-secret','owner',now()-interval '1 day'),
    ('foreign','foreign-session-secret','other',now()+interval '1 day');`);
  active = { user: { id: "owner" }, session: { id: "phone" } };
  deliveries.length = 0; messages.length = 0; revoked.length = 0;
});
afterAll(async () => { await client?.close(); });

test("native registration replaces only its own session's stale native and browser tokens", async () => {
  await add("old-native", "phone");
  await add("same-session-web", "phone", "web");
  await add("other-device-web", "laptop", "web");
  await add("legacy-web", null, "web");
  const response = await registration.POST(req("/api/notifications/register-token", "POST", {
    token: token("new-native"), device: "capacitor-android", platform: "android", transport: "fcm",
  }));
  expect(response.status).toBe(200);
  const tokens = await testDb.select().from(userPushTokens);
  expect(tokens.map(row => row.token).sort()).toEqual(["new-native", "other-device-web", "legacy-web"].map(token).sort());
  expect(tokens.find(row => row.token === token("new-native"))?.sessionId).toBe("phone");
});

test("browser cleanup and stale native unregister do not delete another device's native token", async () => {
  await add("phone-native", "phone");
  await add("laptop-native", "laptop");
  await add("browser", "laptop", "web");
  await add("legacy-browser", null, "web");
  await add("foreign-browser", "foreign", "web", "other");
  async function remove(id: string, browserOnly = false) {
    const result = await registration.DELETE(req("/api/notifications/register-token", "DELETE", { token: token(id), browserOnly }));
    expect(result.status).toBe(200);
  }
  await remove("laptop-native");
  await remove("phone-native", true);
  await remove("foreign-browser", true);
  await remove("browser", true);
  await remove("legacy-browser", true);
  expect((await testDb.select().from(userPushTokens)).map(row => row.id).sort()).toEqual(["foreign-browser", "laptop-native", "phone-native"]);
});

test("session listing and revocation are owner-scoped; only the revoked session's tokens cascade", async () => {
  await add("phone-token", "phone"); await add("laptop-token", "laptop");
  await add("legacy-token", null); await add("foreign-token", "foreign", "android", "other");
  const listing = await sessions.GET(req("/api/account/sessions"));
  const raw = await listing.text();
  expect(raw).not.toContain("session-secret");
  const rows = JSON.parse(raw).sessions;
  expect(rows.map((row: { id: string }) => row.id).sort()).toEqual(["laptop", "phone"]);
  expect(rows.find((row: { id: string }) => row.id === "phone").current).toBe(true);
  async function revoke(id: string) {
    return sessions.DELETE(req("/api/account/sessions", "DELETE", { id }));
  }
  expect((await revoke("phone")).status).toBe(409);
  expect((await revoke("foreign")).status).toBe(404);
  expect((await revoke("laptop")).status).toBe(200);
  expect(revoked).toEqual(["laptop-session-secret"]);
  expect((await testDb.select().from(userPushTokens)).map(row => row.id).sort()).toEqual(["foreign-token", "legacy-token", "phone-token"]);
});

test("single and batched push skip expired or mismatched sessions while preserving legacy registrations", async () => {
  await add("active-token", "phone");
  await add("expired-token", "expired");
  await add("mismatched-token", "foreign");
  await add("legacy-token", null);
  expect(await sender.sendPushToUserNow("owner", payload)).toMatchObject({ attempted: 2, succeeded: 2 });
  expect(deliveries.sort()).toEqual(["active-token", "legacy-token"].map(token).sort());
  deliveries.length = 0;
  const result = await sender.sendPushToUsers([{ userId: "owner", payload }]);
  expect(result.get("owner")).toMatchObject({ attempted: 2, succeeded: 2 });
  expect(deliveries.sort()).toEqual(["active-token", "legacy-token"].map(token).sort());
  expect(await testDb.select().from(userPushTokens)).toHaveLength(4);
});

test("Expo Android gets private inbox details only after the tap and lookup, for immediate and batched sends", async () => {
  const register = await registration.POST(req("/api/notifications/register-token", "POST", {
    token: token("expo"), device: "expo-android", platform: "android", transport: "fcm",
  }));
  expect(register.status).toBe(200);
  await add("capacitor", "laptop");
  const notice = {
    title: "Grade for a student", body: "You scored 85", type: "quiz_graded" as const,
    link: "/courses/private-course", imageUrl: "https://example.test/private.jpg",
    notificationId: "9658a2c1-e9b3-4ad7-8e8b-b78b600273c3",
    metadata: { threadId: "private discussion", notificationId: "untrusted" },
  };
  async function assertDelivery(send: () => Promise<unknown>) {
    messages.length = 0;
    await send();
    expect(messages).toHaveLength(2);
    const expo = messages.find(message => message.tokens.includes(token("expo")));
    expect(expo).toEqual({
      tokens: [token("expo")], data: { notificationId: notice.notificationId },
      notification: { title: "Zyx Academy" },
      android: { priority: "normal", notification: {
        channelId: "zyx_learning", sound: "default", bodyLocKey: "zyx_inbox_new_notification", tag: `zyx:${notice.notificationId}`,
      } },
    });
    const legacy = messages.find(message => message.tokens.includes(token("capacitor")));
    expect(legacy?.notification).toMatchObject({ title: notice.title, body: notice.body, imageUrl: notice.imageUrl });
  }
  await assertDelivery(() => sender.sendPushToUserNow("owner", notice));
  await assertDelivery(() => sender.sendPushToUsers([{ userId: "owner", payload: notice }]));
  messages.length = 0;
  await sender.sendPushToUserNow("owner", {
    ...notice, notificationId: undefined,
    metadata: { quietDigest: "true", groupKey: "quiet-digest", count: "19" },
  });
  const digest = messages.find(message => message.tokens.includes(token("expo")));
  expect(digest?.data).toEqual({ quietDigest: "true", groupKey: "quiet-digest" });
  expect(digest?.android?.notification?.tag).toBe("zyx:quiet-digest");
});


test("Expo iOS registration and rotation keep legacy and other APNs environments isolated", async () => {
  const original = process.env.BETTER_AUTH_URL;
  const environment = process.env.ZYX_ENVIRONMENT;
  process.env.BETTER_AUTH_URL = "https://staging.zyxacademy.com";
  process.env.ZYX_ENVIRONMENT = "staging";
  const path = "/api/notifications/register-token";
  const label = (device: string, token: string) => ({ platform: "ios", transport: "apns", device, token });
  const cap = "a1".repeat(32), dev = "b2".repeat(32), prod = "c3".repeat(32), rotation = "d4".repeat(32);
  try {
    expect((await registration.POST(req(path, "POST", label("capacitor-ios", cap)))).status).toBe(200);
    expect(await (await registration.POST(req(path, "POST", label("expo-ios-development", dev)))).json())
      .toMatchObject({ transport: "apns", device: "expo-ios-development", transportActive: true });
    expect(await (await registration.POST(req(path, "POST", label("expo-ios-production", prod)))).json())
      .toMatchObject({ transport: "apns", device: "expo-ios-production", transportActive: false });
    expect((await registration.POST(req(path, "POST", label("expo-ios-development", rotation)))).status).toBe(200);
    expect((await registration.POST(req(path, "POST", label("capacitor-ios", prod)))).status).toBe(409);
    expect((await registration.POST(req(path, "POST", label("expo-ios-unknown", dev)))).status).toBe(422);
    const wrong = new NextRequest("https://www.zyxacademy.com" + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(label("expo-ios-development", dev)),
    });
    expect((await registration.POST(wrong)).status).toBe(422);
    expect((await testDb.select().from(userPushTokens)).map(row => row.token).sort()).toEqual([cap, prod, rotation].sort());
    const summary = await (await status.GET()).json();
    expect(summary.apnsProfiles).toEqual({
      capacitor: { configured: true, registeredCount: 1, active: true },
      expoDevelopment: { configured: true, registeredCount: 1, active: true },
      expoProduction: { configured: false, registeredCount: 1, active: false },
    });
    expect(summary.devices.find(({ device }: { device: string }) => device === "expo-ios-production").transportActive).toBe(false);
    expect(JSON.stringify(summary)).not.toContain(prod);
  } finally {
    if (original === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = original;
    if (environment === undefined) delete process.env.ZYX_ENVIRONMENT; else process.env.ZYX_ENVIRONMENT = environment;
  }
});
