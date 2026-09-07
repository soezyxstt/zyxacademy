import { describe, expect, it, mock, beforeEach } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let mockSession: any = null;
let mockHeaders = new Headers();

const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });

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

import { GET } from "@/app/api/notifications/history/route";

async function setupTables() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      ban_expires INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      attempted INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
}

describe("GET /api/notifications/history fluid CPU optimizations", () => {
  beforeEach(async () => {
    await setupTables();
    await client.execute("DELETE FROM notifications;");
    await client.execute("DELETE FROM user;");
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
    await client.execute(`
      INSERT INTO user (id, name, email, role, created_at, updated_at)
      VALUES ('user-1', 'Student One', 'student@zyx.id', 'student', 1000, 1000);
    `);
    await client.execute(`
      INSERT INTO notifications (id, user_id, title, body, type, read, metadata, created_at)
      VALUES 
        ('n1', 'user-1', 'Quiz Ready', 'Try your quiz', 'quiz_published', 0, '{}', 1000),
        ('n2', 'user-1', 'Flashcard Due', 'Review now', 'flashcard_reminder', 0, '{}', 2000),
        ('n3', 'user-1', 'Old Announcement', 'Read this', 'announcement', 1, '{}', 500);
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
    await client.execute(`
      INSERT INTO user (id, name, email, role, created_at, updated_at)
      VALUES ('user-2', 'Student Two', 'student2@zyx.id', 'student', 1000, 1000);
    `);
    await client.execute(`
      INSERT INTO notifications (id, user_id, title, body, type, read, metadata, created_at)
      VALUES 
        ('n4', 'user-2', 'New Quiz', 'Quiz available', 'quiz_published', 0, '{}', 3000);
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
