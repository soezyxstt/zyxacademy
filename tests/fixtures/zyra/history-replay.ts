import { expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { tutorChatMessages, chatSessions, zyraMessageAttachments } from "@/db/schema";

test("history replay preserves one pair and one image link, including after expiry", async () => {
  const path = process.env.ZYRA_HISTORY_TEST_DB;
  if (!path) throw new Error("Run through tests/contracts/zyra-coding-history.test.ts");
  const client = createClient({ url: `file:${path.replaceAll("\\", "/")}` });
  try {
    await client.executeMultiple(`
      CREATE TABLE tutor_chat_messages (id TEXT PRIMARY KEY, student_id TEXT, course_id TEXT, session_id TEXT, role TEXT, content TEXT, sources TEXT, created_at INTEGER DEFAULT (unixepoch()));
      CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, student_id TEXT, course_id TEXT, last_message_at INTEGER, updated_at INTEGER);
      CREATE TABLE zyra_message_attachments (id TEXT PRIMARY KEY, student_id TEXT, course_id TEXT, session_id TEXT, message_id TEXT, expires_at INTEGER);
      INSERT INTO chat_sessions VALUES ('session', 'student', 'course', 0, 0);
      INSERT INTO zyra_message_attachments VALUES ('image', 'student', 'course', 'session', NULL, 4102444800);
    `);
    const source = await Bun.file("app/actions/tutor.ts").text();
    // Isolate the real action from unrelated provider imports, retaining its transaction and authorization calls.
    const action = source.slice(source.indexOf("const CHAT_HISTORY_LIMIT"), source.indexOf("export async function loadTutorHistoryAction"))
      .replace("export async function", "async function");
    const dependencies = {
      db: drizzle(client), tutorChatMessages, chatSessions, zyraMessageAttachments,
      and, asc, desc, eq, gt, inArray, isNull, or, createHash, randomUUID,
      requireCourseAccess: async () => ({ user: { id: "student" }, access: { tier: "paid" } }),
      requireOwnedChatSession: async (_user: string, _course: string, session: string) => session || "session",
      sanitizeAnswer: (text: string) => text,
      isZyraCanvasFeatureEnabled: () => false,
      serializeTutorMessageSources: () => null,
      assertZyraImageCount: () => {},
    };
    const js = new Bun.Transpiler({ loader: "ts" }).transformSync(action);
    const save = new Function(...Object.keys(dependencies), `${js}; return saveTutorMessagesAction;`)(...Object.values(dependencies));
    const pair = [{ role: "student", content: "Question", attachmentIds: ["image"] }, { role: "ai", content: "Answer" }];
    await save("course", pair, "session", "request-1");
    const first = await client.execute("SELECT id FROM tutor_chat_messages ORDER BY id");
    await client.execute("UPDATE zyra_message_attachments SET expires_at = 0");
    await save("course", pair, "session", "request-1");
    expect((await client.execute("SELECT id FROM tutor_chat_messages ORDER BY id")).rows).toEqual(first.rows);
    expect(first.rows).toHaveLength(2);
    expect((await client.execute("SELECT message_id FROM zyra_message_attachments")).rows[0].message_id).toBeTruthy();
    await expect(save("course", [{ ...pair[0], content: "Changed" }, pair[1]], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", [pair[0], { ...pair[1], content: "Different answer" }], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", pair, "another-session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", [{ ...pair[0], attachmentIds: [] }, pair[1]], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await save("course", pair.map(({ attachmentIds: _ids, ...row }) => row), "session", "request-2");
    expect((await client.execute("SELECT id FROM tutor_chat_messages")).rows).toHaveLength(4);
    await expect(save("course", pair, "session", "request-3")).rejects.toThrow("ZYRA_ATTACHMENT_LINK_FAILED");
    expect((await client.execute("SELECT id FROM tutor_chat_messages")).rows).toHaveLength(4);
  } finally { client.close(); }
});
