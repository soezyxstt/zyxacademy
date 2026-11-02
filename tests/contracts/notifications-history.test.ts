import { describe, expect, it, mock, beforeEach, afterAll } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { NextRequest } from "next/server";

let mockSession: any = null;
let mockHeaders = new Headers();

const {client,testDb}=await createPostgresTestDb();
afterAll(()=>client.close());

mock.module("@/db", () => ({
  db: testDb,
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



describe("GET /api/notifications/history fluid CPU optimizations", () => {
  beforeEach(async () => {
    await client.exec("DELETE FROM notifications;");
    await client.exec('DELETE FROM "user";');
    mockSession = null;
    mockHeaders = new Headers();
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
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=15");

    const json = await res.json();
    expect(json.unreadCount).toBe(2);
    expect(json.notifications).toEqual([]);
    expect(json.limit).toBe(0);
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
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=15");

    const json = await res.json();
    expect(json.unreadCount).toBe(1);
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0].id).toBe("n4");
  });
});
