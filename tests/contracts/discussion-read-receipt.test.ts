import { expect, test } from "bun:test";
import { signDiscussionReadReceipt, verifyDiscussionReadReceipt } from "@/lib/discussions/read-receipt";

const secret = "fixture signing secret";
const snapshot = { userId: "alice", threadId: "thread", status: "open" as const, statusRevision: 2,
 messages: [{ id: "first", seq: 1, revision: 3 }, { id: "second", seq: 2, revision: 1 }] };

test("read receipts bind fetched revisions, user, thread and status", () => {
 const token = signDiscussionReadReceipt(snapshot, secret);
 expect(verifyDiscussionReadReceipt(token, "alice", "thread", secret)).toEqual(snapshot);
 expect(verifyDiscussionReadReceipt(token, "bob", "thread", secret)).toBeNull();
 expect(verifyDiscussionReadReceipt(token, "alice", "other", secret)).toBeNull();
 const [, signature] = token.split(".");
 const forged = Buffer.from(JSON.stringify({ ...snapshot, statusRevision: 999, messages: [{ ...snapshot.messages[0], revision: 999 }] })).toString("base64url");
 expect(verifyDiscussionReadReceipt(`${forged}.${signature}`, "alice", "thread", secret)).toBeNull();
 expect(verifyDiscussionReadReceipt(token, "alice", "thread", "other secret")).toBeNull();
 expect(verifyDiscussionReadReceipt(token, "alice", "thread", secret)).toEqual(snapshot);
});

test("receipts reject duplicate observations and malformed input", () => {
 expect(() => signDiscussionReadReceipt({ ...snapshot, messages: [snapshot.messages[0], snapshot.messages[0]] }, secret)).toThrow();
 expect(verifyDiscussionReadReceipt("invalid", "alice", "thread", secret)).toBeNull();
});
