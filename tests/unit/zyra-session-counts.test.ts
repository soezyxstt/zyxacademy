import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

const sqlite = new Database(":memory:");
mock.module("@/db", () => ({ db: drizzle(sqlite) }));
const { getRecentSessionsQuery } = await import("@/lib/zyra/analytics-queries");

describe("tutor session message counts", () => {
  it("counts only matching user and course messages and keeps empty sessions", () => {
    const query = getRecentSessionsQuery("user-1", "course-1", 30).toSQL();
    const rows = sqlite.query(`
      WITH chat_sessions(id, student_id, course_id, title, started_at, last_message_at) AS (
        VALUES ('s1', 'user-1', 'course-1', 'First', 1, 3),
               ('s2', 'user-1', 'course-1', 'Empty', 1, 2),
               ('s3', 'user-2', 'course-1', 'Other user', 1, 4),
               ('s4', 'user-1', 'course-2', 'Other course', 1, 5)
      ), tutor_chat_messages(id, session_id, student_id, course_id) AS (
        VALUES ('m1', 's1', 'user-1', 'course-1'),
               ('m2', 's1', 'user-1', 'course-1'),
               ('m3', 's1', 'user-2', 'course-1'),
               ('m4', 's1', 'user-1', 'course-2'),
               ('m5', 's3', 'user-2', 'course-1')
      ) ${query.sql}
    `).all(...query.params as (string | number | null)[]);

    expect(rows).toEqual([
      { id: "s1", title: "First", started_at: 1, last_message_at: 3, messageCount: 2 },
      { id: "s2", title: "Empty", started_at: 1, last_message_at: 2, messageCount: 0 },
    ]);
  });
});
