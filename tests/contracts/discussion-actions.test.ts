import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("create and reply return serializable allowlisted failures without exposing unexpected errors", async () => {
  let failure: unknown = null;
  let readCall: unknown[] = [];
  let threadCall: unknown[] = [];
  const calls: string[] = [];
  const submit = async (actorId: string) => {
    calls.push(actorId);
    if (failure) throw failure;
    return { threadId: "thread", messageId: "message" };
  };
  const inngestCalls: unknown[] = [];
  const afterCalls: Array<() => unknown> = [];
  const titleCalls: unknown[] = [];
  let profileCall: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { after: (fn: () => unknown) => { afterCalls.push(fn); } },
    "@/jobs/client": { inngest: { send: async (payload: unknown) => { inngestCalls.push(payload); } } },
    "./session": { getSessionDiscussionActor: async () => ({ id: "viewer" }) },
    "./policy": {
      validDiscussionId: (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 160,
      deriveInitialDiscussionTitle: (body: string, hasAttachments = false) => body.trim().split(/[.!?]/)[0] || (hasAttachments ? "Pertanyaan gambar" : "Pertanyaan baru"),
    },
    "./title-ai": { generateDiscussionThreadTitle: async (...args: unknown[]) => { titleCalls.push(args); } },
    "./service": {
      createThread: submit, reply: submit, forward: submit,
      getThread: async (...args: unknown[]) => { threadCall = args; },
      markRead: async (...args: unknown[]) => { readCall = args; return { throughSeq: 2 }; },
      getDiscussionAuthorProfile: async (...args: unknown[]) => { profileCall = args; if (failure) throw failure; return { kind: "limited", id: "author", name: "Nadia", role: "student", avatarUrl: null, visibilityReason: "private" }; },
    },
  };
  const exports: Record<string, any> = {};
  const output = ts.transpileModule(readFileSync("lib/discussions/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, Error, require: (name: string) => dependencies[name] });
  expect(JSON.parse(JSON.stringify(await exports.createThread({ body: "Mengapa limit perlu difaktorkan? Jelaskan.", attachmentIds: [] })))).toEqual({ ok: true, value: { threadId: "thread", messageId: "message" } });
  expect(inngestCalls).toEqual([{ id: "discussion-thread-title-thread", name: "discussion/thread.title.requested", data: { threadId: "thread", expectedTitle: "Mengapa limit perlu difaktorkan" } }]);
  expect(afterCalls).toHaveLength(1);
  await afterCalls[0]();
  expect(titleCalls).toEqual([["thread", "Mengapa limit perlu difaktorkan"]]);
  inngestCalls.length = 0;
  afterCalls.length = 0;
  expect(JSON.parse(JSON.stringify(await exports.createThread({ body: "Teks", title: "Judul manual", attachmentIds: [] })))).toEqual({ ok: true, value: { threadId: "thread", messageId: "message" } });
  expect(inngestCalls).toEqual([]);
  expect(afterCalls).toEqual([]);
  for (const [code, expected] of [["DISCUSSION_INVALID", "invalid"], ["DISCUSSION_UNAVAILABLE", "unavailable"], ["DISCUSSION_RATE_LIMITED", "rate_limited"], ["DISCUSSION_CONFLICT", "conflict"], ["DISCUSSION_RESOLVED", "resolved"], ["DISCUSSION_ATTACHMENT_EXPIRED", "attachment_expired"], ["DISCUSSION_IMAGE_SCOPE", "unknown"], ["PRIVATE BACKEND DETAIL", "unknown"]]) {
    failure = new Error(code);
    const result = JSON.parse(JSON.stringify(await exports.reply({})));
    expect(result).toEqual({ ok: false, error: expected });
    expect(JSON.stringify(result)).not.toContain("PRIVATE BACKEND DETAIL");
  }
  failure = { error: "PRIVATE JSON" };
  expect(JSON.parse(JSON.stringify(await exports.createThread({ body: "Teks", attachmentIds: [] })))).toEqual({ ok: false, error: "unknown" });
  expect(calls.every((actor) => actor === "viewer")).toBe(true);
  failure = Object.assign(new Error("DISCUSSION_REPLAY_UNVERIFIED"), { threadId: "thread", messageId: "message", secret: "PRIVATE" });
  expect(JSON.parse(JSON.stringify(await exports.reply({})))).toEqual({ ok: false, error: "replay_unverified", value: { threadId: "thread", messageId: "message" } });
  expect(JSON.parse(JSON.stringify(await exports.forward("source", "thread", "request")))).toEqual({ ok: false, error: "replay_unverified", value: { threadId: "thread", messageId: "message" } });
  failure = Object.assign(new Error("DISCUSSION_REPLAY_UNVERIFIED"), { threadId: "thread", messageId: "" });
  expect(JSON.parse(JSON.stringify(await exports.reply({})))).toEqual({ ok: false, error: "unknown" });
  failure = null;
  expect(JSON.parse(JSON.stringify(await exports.markRead("thread", 2, "receipt", ["message"])))).toEqual({ throughSeq: 2 });
  expect(readCall).toEqual(["viewer", "thread", 2, "receipt", ["message"]]);
  await exports.getThread("thread", undefined, "message");
  expect(threadCall).toEqual(["viewer", "thread", undefined, "message"]);
  expect(await exports.getAuthorProfile("thread", "author")).toMatchObject({ kind: "limited", id: "author" });
  expect(profileCall).toEqual(["viewer", "thread", "author"]);
  failure = new Error("SECRET PROFILE DB ERROR");
  await expect(exports.getAuthorProfile("thread", "author")).rejects.toThrow("Permintaan tidak dapat diproses. Coba lagi.");
});
