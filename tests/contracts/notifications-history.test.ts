import { describe, expect, it, mock, beforeEach, afterAll } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { loadInbox, markInboxRead } from "../../apps/mobile-native/features/notification-inbox/client";

let mockSession: any = null;
let mockHeaders = new Headers();
let discussionVisible = false;

const {client,testDb}=await createPostgresTestDb();
afterAll(()=>client.close());

mock.module("@/db", () => ({
  db: testDb,
}));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionChannelVisibility: async () => {
    if (!discussionVisible) throw new Error("DISCUSSION_UNAVAILABLE");
    return { actor: { role: "student" }, predicate: sql`true` };
  },
}));

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
  },
}));

mock.module("next/headers", () => ({
  headers: async () => mockHeaders,
}));

const {GET}=await import("@/app/api/notifications/history/route");
const {PATCH}=await import("@/app/api/notifications/read/route");



describe("GET /api/notifications/history fluid CPU optimizations", () => {
  beforeEach(async () => {
    await client.exec("DELETE FROM notifications;");
    await client.exec("DELETE FROM discussion_channels;");
    await client.exec('DELETE FROM "user";');
    mockSession = null;
    mockHeaders = new Headers();
    discussionVisible = false;
  });

  it("round-trips Expo inbox reads and acknowledgements under each recipient's session", async () => {
    const firstId = "85a3dcaa-b695-4594-8561-89b3d6dc89cf";
    const secondId = "5691cf2f-6b8a-48ae-8a0a-24033002ddf1";
    await client.exec(`
      INSERT INTO "user" (id, name, email, role) VALUES
        ('one', 'One', 'one@example.test', 'student'), ('two', 'Two', 'two@example.test', 'tutor');
      INSERT INTO notifications (id, user_id, title, body, type, metadata) VALUES
        ('${firstId}', 'one', 'First', 'First details', 'announcement', '{"url":"/dashboard"}'),
        ('${secondId}', 'two', 'Second', 'Second details', 'announcement', '{"url":"/tutor"}');
    `);
    const origin = "https://inbox.example.test";
    const network = createNativeTransport({ origin, fetcher: async (url, init) => {
      const request = new NextRequest(url, { method: init.method, headers: init.headers, body: init.body });
      mockHeaders = request.headers;
      const cookie = request.headers.get("cookie");
      mockSession = cookie === "fixture=one" ? { user: { id: "one", role: "student" } }
        : cookie === "fixture=two" ? { user: { id: "two", role: "tutor" } } : null;
      if (request.method === "GET" && request.nextUrl.pathname === "/api/notifications/history") return GET(request);
      if (request.method === "PATCH" && request.nextUrl.pathname === "/api/notifications/read") return PATCH(request);
      throw new Error("Unexpected inbox endpoint");
    } });
    const signIn = (accountId: string) => network.setSession({
      origin, accountId, sessionId: `session-${accountId}`, readCookie: () => `fixture=${accountId}`,
    });
    const student = signIn("one");
    const signal = new AbortController().signal;
    expect(await loadInbox(student, false, signal)).toEqual({ unread: 1, rows: [] });
    expect((await loadInbox(student, true, signal)).rows).toMatchObject([{ id: firstId, href: "/dashboard", read: false }]);
    await markInboxRead(student, { id: secondId }, signal);
    await markInboxRead(student, { id: firstId }, signal);
    await markInboxRead(student, { id: firstId }, signal);
    expect((await loadInbox(student, false, signal)).unread).toBe(0);

    const tutor = signIn("two");
    await expect(loadInbox(student, true, signal)).rejects.toThrow();
    expect(await loadInbox(tutor, false, signal)).toEqual({ unread: 1, rows: [] });
    await markInboxRead(tutor, { all: true }, signal);
    expect((await loadInbox(tutor, true, signal)).rows).toMatchObject([{ id: secondId, href: "/tutor", read: true }]);
    await expect(loadInbox(signIn("expired"), true, signal)).rejects.toThrow("unavailable");
  });

  it("resolves a tapped notification only for its current owner and visibility", async () => {
    const id = "a879e028-7191-42cf-b6a6-4d3816df5535";
    await client.exec(`
      INSERT INTO "user" (id, name, email, role) VALUES ('tap-owner', 'Owner', 'owner@example.test', 'student'),
        ('tap-other', 'Other', 'other@example.test', 'admin');
      INSERT INTO notifications (id, user_id, title, body, type, metadata)
        VALUES ('${id}', 'tap-owner', 'Update', 'Details', 'announcement', '{"url":"/dashboard/schedule"}');
    `);
    const request = (search: string) => GET(new NextRequest("http://localhost/api/notifications/history?" + search));
    mockHeaders = new Headers({ cookie: "better-auth.session_token=test" });
    mockSession = { user: { id: "tap-other", role: "admin" } };
    expect((await request("tapId=" + id)).status).toBe(404);
    expect((await request("tapId=" + id + "&userId=tap-owner")).status).toBe(403);
    mockSession = { user: { id: "tap-owner", role: "student" } };
    const res = await request("tapId=" + id);
    expect(await res.json()).toEqual({ id, url: "/dashboard/schedule" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await request("tapId=bad")).status).toBe(400);
    await client.exec(`UPDATE notifications SET type='discussion', metadata='{"channelId":"hidden","threadId":"hidden"}' WHERE id='${id}'`);
    expect((await request("tapId=" + id)).status).toBe(404);
  });

  it("fast-fails with 401 when no cookie or authorization header is present without touching session", async () => {
    mockHeaders = new Headers();
    const req = new NextRequest("http://localhost/api/notifications/history");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("serves lightweight countOnly request with cache headers and zero notification rows", async () => {
    await client.exec(`
      INSERT INTO "user" (id, name, email, role, created_at, updated_at)
      VALUES ('user-1', 'Student One', 'student@zyx.id', 'student', to_timestamp(1), to_timestamp(1));
    `);
    await client.exec(`
      INSERT INTO notifications (id, user_id, title, body, type, read, metadata, created_at)
      VALUES 
        ('n1', 'user-1', 'Quiz Ready', 'Try your quiz', 'quiz_published', false, '{}', to_timestamp(1)),
        ('n2', 'user-1', 'Flashcard Due', 'Review now', 'flashcard_reminder', false, '{}', to_timestamp(2)),
        ('n3', 'user-1', 'Old Announcement', 'Read this', 'announcement', true, '{}', to_timestamp(0.5));
    `);

    mockHeaders = new Headers({ cookie: "better-auth.session_token=test" });
    mockSession = { user: { id: "user-1", role: "student" } };

    const req = new NextRequest("http://localhost/api/notifications/history?countOnly=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const json = await res.json();
    expect(json.unreadCount).toBe(2);
    expect(json.notifications).toEqual([]);
    expect(json.limit).toBe(0);
  });

  it("replaces stored role-specific discussion URLs after a role change", async () => {
    await client.exec(`
      INSERT INTO "user" (id, name, email, role) VALUES ('former-tutor', 'Former tutor', 'former@example.test', 'student');
      INSERT INTO discussion_channels (id, kind, title) VALUES ('global', 'global', 'Global');
      INSERT INTO notifications (id, user_id, title, body, type, metadata)
      VALUES ('discussion-old', 'former-tutor', 'Activity', 'Activity', 'discussion',
        '{"channelId":"global","threadId":"thread-45","messageId":"message-450","url":"/tutor/discussions?thread=thread-45"}');
    `);
    discussionVisible = true;
    mockHeaders = new Headers({ cookie: "better-auth.session_token=test" });
    mockSession = { user: { id: "former-tutor", role: "student" } };
    const response = await GET(new NextRequest("http://localhost/api/notifications/history"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0].metadata.url).toBe("/discussions?thread=thread-45&message=message-450");
  });

  it("serves full notification rows on demand when requested without countOnly", async () => {
    await client.exec(`
      INSERT INTO "user" (id, name, email, role, created_at, updated_at)
      VALUES ('user-2', 'Student Two', 'student2@zyx.id', 'student', to_timestamp(1), to_timestamp(1));
    `);
    await client.exec(`
      INSERT INTO notifications (id, user_id, title, body, type, read, metadata, created_at)
      VALUES 
        ('n4', 'user-2', 'New Quiz', 'Quiz available', 'quiz_published', false, '{}', to_timestamp(3));
    `);

    mockHeaders = new Headers({ cookie: "better-auth.session_token=test" });
    mockSession = { user: { id: "user-2", role: "student" } };

    const req = new NextRequest("http://localhost/api/notifications/history?limit=20");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const json = await res.json();
    expect(json.unreadCount).toBe(1);
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0].id).toBe("n4");
  });
});
