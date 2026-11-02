import { expect, test } from "bun:test";
import { createPostgresTestDb } from "../../helpers/postgres";
import { affectedRows } from "@/lib/mutation-result";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { user, courses, tutorChatMessages, chatSessions, zyraMessageAttachments } from "@/db/schema";

test("history replay preserves one pair and one image link, including after expiry", async () => {
  const { client, testDb } = await createPostgresTestDb();
  try {
    await testDb.insert(user).values({ id: "student", name: "Student", email: "student@example.test" });
    await testDb.insert(courses).values({ id: "course", title: "Course", category: "Test" });
    await testDb.insert(chatSessions).values({ id: "session", studentId: "student", courseId: "course", title: "Session" });
    await testDb.insert(zyraMessageAttachments).values({ id: "image", studentId: "student", courseId: "course", sessionId: "session", objectKey: "image", mimeType: "image/png", byteSize: 1, width: 1, height: 1, sanitizedSha256: "hash", sanitizerVersion: "test", expiresAt: new Date("2100-01-01T00:00:00Z") });
    const source = await Bun.file("app/actions/tutor.ts").text();
    // Isolate the real action from unrelated provider imports, retaining its transaction and authorization calls.
    const action = source.slice(source.indexOf("const CHAT_HISTORY_LIMIT"), source.indexOf("export async function loadTutorHistoryAction"))
      .replace("export async function", "async function");
    const dependencies = {
      db: testDb, tutorChatMessages, chatSessions, zyraMessageAttachments, affectedRows,
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
    const first = await client.query("SELECT id FROM tutor_chat_messages ORDER BY id");
    await testDb.update(zyraMessageAttachments).set({ expiresAt: new Date(0) });
    await save("course", pair, "session", "request-1");
    expect((await client.query("SELECT id FROM tutor_chat_messages ORDER BY id")).rows).toEqual(first.rows);
    expect(first.rows).toHaveLength(2);
    expect((await client.query<{ message_id: string | null }>("SELECT message_id FROM zyra_message_attachments")).rows[0].message_id).toBeTruthy();
    await expect(save("course", [{ ...pair[0], content: "Changed" }, pair[1]], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", [pair[0], { ...pair[1], content: "Different answer" }], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", pair, "another-session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await expect(save("course", [{ ...pair[0], attachmentIds: [] }, pair[1]], "session", "request-1")).rejects.toThrow("ZYRA_HISTORY_REPLAY_CONFLICT");
    await save("course", pair.map(({ attachmentIds: _ids, ...row }) => row), "session", "request-2");
    expect((await client.query("SELECT id FROM tutor_chat_messages")).rows).toHaveLength(4);
    await expect(save("course", pair, "session", "request-3")).rejects.toThrow("ZYRA_ATTACHMENT_LINK_FAILED");
    expect((await client.query("SELECT id FROM tutor_chat_messages")).rows).toHaveLength(4);
  } finally { await client.close(); }
}, 120_000);
