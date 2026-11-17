const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const source = readFileSync("lib/discussions/service.ts", "utf8");
const fragment = (start, end) => {
 const first = source.indexOf(start), last = source.indexOf(end, first);
 assert.ok(first >= 0 && last > first, `missing service section ${start}`);
 return source.slice(first, last);
};
const code = ts.transpileModule([
 fragment("function checkId(", "function encodeCursor("),
 fragment("async function lockRequest(", "async function validateSubmit("),
 fragment("async function requireAvailableForward(", "export async function createThread("),
 fragment("export async function createThread(", "export async function edit("),
 fragment("export async function forward(", "export async function setReaction("),
].join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
 const messages = [], threads = [], rewards = [], ai = [], events = [];
 const channels = { global: { id: "global", kind: "global" }, other: { id: "other", kind: "global" },
  tech: { id: "tech", kind: "technical" } };
 const discussionMessages = { id: "id", authorId: "authorId", requestId: "requestId", threadId: "threadId", deletedAt: "deletedAt" };
 const discussionThreads = {};
 let serial = 0, deniedThread = null, deniedMessage = null;
 const denied = () => { throw new Error("DISCUSSION_UNAVAILABLE"); };
 const threadAccess = async (_actor, threadId) => {
  const thread = threads.find(row => row.id === threadId);
  if (!thread || deniedThread === threadId) denied();
  return { thread, channel: channels[thread.channelId] };
 };
 const messageAccess = async (actor, messageId) => {
  const message = messages.find(row => row.id === messageId);
  if (!message || deniedMessage === messageId) denied();
  return { ...(await threadAccess(actor, message.threadId)), message };
 };
 const tx = {
  execute: async () => ({}),
  select: () => ({ from: table => ({ where: predicate => ({ limit: async () => {
   assert.equal(table, discussionMessages);
   return messages.filter(predicate).slice(0, 1);
  } }) }) }),
  insert: table => ({ values: async row => {
   if (table === discussionThreads) threads.push({ status: "open", ...row });
   else if (table === discussionMessages) messages.push({ deletedAt: null, ...row });
   else throw new Error("Unexpected insert");
  } }),
 };
 const exports = {};
 runInNewContext(code, {
  exports, createHash, discussionMessages, discussionThreads,
  db: { transaction: work => work(tx) },
  getDiscussionActor: async id => ({ id, role: "student" }),
  requireDiscussionChannelAccess: async (_actor, channelId) => channels[channelId] || denied(),
  requireDiscussionThreadAccess: threadAccess,
  requireDiscussionMessageAccess: messageAccess,
  ensureDiscussionTeamChannel: async () => channels.tech,
  validDiscussionId: value => typeof value === "string" && value.length > 0,
  validDiscussionText: value => typeof value === "string" && value.trim().length > 0 && value.length <= 160,
  validDiscussionReplyType: (type, parent) => type === "answer" ? parent == null : type === "reply" && typeof parent === "string" && !!parent,
  invalid: () => new Error("DISCUSSION_INVALID"), unavailable: () => new Error("DISCUSSION_UNAVAILABLE"),
  and: (...predicates) => row => predicates.every(predicate => predicate(row)),
  eq: (field, value) => row => row[field] === value, isNull: field => row => row[field] == null,
  sql: () => ({}), id: () => `id-${++serial}`, admit: async () => {}, validateSubmit: async () => {},
  nextSequence: async (_tx, threadId) => {
   const { thread } = await threadAccess(null, threadId);
   return { thread, seq: thread.nextSeq++ };
  },
  recordDiscussionParticipant: async () => {}, attachDiscussionImages: async () => {},
  enqueueDiscussionReward: async (_tx, value) => rewards.push(value),
  event: async (...args) => events.push(args),
  aiRequest: async (_tx, messageId, _actor, ask) => { if (ask) ai.push([messageId, "zyra"]); },
  labelRequest: async (_tx, messageId) => ai.push([messageId, "label"]),
  canForwardDiscussion: () => true,
 });
 return { ...exports, messages, threads, rewards, ai, events,
  denyThread: value => { deniedThread = value; }, denyMessage: value => { deniedMessage = value; } };
}

const submit = (requestId, body = "Original") => ({ requestId, body, attachmentIds: [], mentionIds: [], askZyra: false });
const sameResult = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

test("questions replay after edits and deletion and bind each normalized submit field", async () => {
 const f = fixture();
 const input = { ...submit("question"), channelId: "global", title: "Original title", askZyra: true,
  skinId: "skin", attachmentIds: ["image-b", "image-a"], mentionIds: ["bob", "alice"] };
 const result = await f.createThread("alice", input);
 const message = f.messages.find(row => row.id === result.messageId);
 assert.match(message.submissionFingerprint, /^[0-9a-f]{64}$/);
 assert.ok(!message.submissionFingerprint.includes(input.body));
 Object.assign(message, { body: "Edited", mentionIds: [], deletedAt: new Date() });
 sameResult(await f.createThread("alice", { ...input, attachmentIds: [...input.attachmentIds].reverse(), mentionIds: [...input.mentionIds].reverse() }), result);
 for (const change of [{ channelId: "other" }, { title: "Changed" }, { body: "Changed" }, { attachmentIds: ["image-a"] },
  { mentionIds: ["bob"] }, { askZyra: false }, { skinId: null }]) {
  await assert.rejects(f.createThread("alice", { ...input, ...change }), /DISCUSSION_CONFLICT/);
 }
 await assert.rejects(f.reply("alice", { ...submit("question"), threadId: result.threadId, messageType: "answer" }), /DISCUSSION_CONFLICT/);
 f.denyThread(result.threadId);
 await assert.rejects(f.createThread("alice", input), /DISCUSSION_UNAVAILABLE/);
 f.denyThread(null);
 assert.equal(f.rewards.length, 1);
 assert.equal(f.events.length, 1);
 assert.equal(f.ai.filter(([, kind]) => kind === "zyra").length, 1);
 assert.equal(f.ai.filter(([, kind]) => kind === "label").length, 1);
 const help = { ...submit("help"), channelId: "tech", title: "Help", helpKind: "bug" };
 await f.createThread("alice", help);
 await assert.rejects(f.createThread("alice", { ...help, helpKind: "feature" }), /DISCUSSION_CONFLICT/);
});

test("answers and contextual replies replay after edits, deletion, and deleted parents", async () => {
 const f = fixture();
 const question = await f.createThread("alice", { ...submit("question"), channelId: "global", title: "Question" });
 const answerInput = { ...submit("answer"), threadId: question.threadId, messageType: "answer", askZyra: true, mentionIds: ["alice"] };
 const answer = await f.reply("bob", answerInput);
 const replyInput = { ...submit("reply"), threadId: question.threadId, messageType: "reply", replyTo: answer.messageId };
 const reply = await f.reply("bob", replyInput);
 Object.assign(f.messages.find(row => row.id === answer.messageId), { body: "Moderated", mentionIds: [], deletedAt: new Date() });
 Object.assign(f.messages.find(row => row.id === reply.messageId), { body: "Edited reply", deletedAt: new Date() });
 sameResult(await f.reply("bob", answerInput), answer);
 sameResult(await f.reply("bob", replyInput), reply);
 await assert.rejects(f.reply("bob", { ...answerInput, body: "Changed" }), /DISCUSSION_CONFLICT/);
 await assert.rejects(f.reply("bob", { ...answerInput, messageType: "reply", replyTo: question.messageId }), /DISCUSSION_CONFLICT/);
 await assert.rejects(f.reply("bob", { ...replyInput, replyTo: question.messageId }), /DISCUSSION_CONFLICT/);
 assert.equal(f.rewards.filter(row => row.kind === "answer").length, 1);
 assert.equal(f.ai.filter(([id, kind]) => id === answer.messageId && kind === "zyra").length, 1);
 assert.equal(f.messages.length, 3);
});

test("forward replay reauthorizes its source, detects changed identity, and accepts a deleted copy", async () => {
 const f = fixture();
 const first = await f.createThread("alice", { ...submit("first"), channelId: "global", title: "First" });
 const second = await f.createThread("alice", { ...submit("second"), channelId: "global", title: "Second" });
 const forwarded = await f.forward("bob", first.messageId, second.threadId, "forward");
 f.messages.find(row => row.id === forwarded.messageId).deletedAt = new Date();
 sameResult(await f.forward("bob", first.messageId, second.threadId, "forward"), forwarded);
 await assert.rejects(f.forward("bob", second.messageId, second.threadId, "forward"), /DISCUSSION_CONFLICT/);
 await assert.rejects(f.forward("bob", first.messageId, first.threadId, "forward"), /DISCUSSION_CONFLICT/);
 f.denyMessage(first.messageId);
 await assert.rejects(f.forward("bob", first.messageId, second.threadId, "forward"), /DISCUSSION_UNAVAILABLE/);
 f.denyMessage(null);
 f.messages.find(row => row.id === first.messageId).deletedAt = new Date();
 await assert.rejects(f.forward("bob", first.messageId, second.threadId, "forward"), /DISCUSSION_UNAVAILABLE/);
});

test("legacy rows fail closed and expose only an authorized reference for manual recovery", async () => {
 const f = fixture();
 const input = { ...submit("legacy"), channelId: "global", title: "Question" };
 const result = await f.createThread("alice", input);
 f.messages.find(row => row.id === result.messageId).submissionFingerprint = null;
 for (const body of ["Original", "Changed"]) {
  await assert.rejects(f.createThread("alice", { ...input, body }), error => {
   assert.equal(error.message, "DISCUSSION_REPLAY_UNVERIFIED");
   assert.equal(error.threadId, result.threadId);
   assert.equal(error.messageId, result.messageId);
   return true;
  });
 }
 f.denyThread(result.threadId);
 await assert.rejects(f.createThread("alice", input), /DISCUSSION_UNAVAILABLE/);
 assert.equal(f.messages.length, 1);
});

test("legacy forward recovery reauthorizes the stored source even when a different source was submitted", async () => {
 const f = fixture();
 const first = await f.createThread("alice", { ...submit("first"), channelId: "global", title: "First" });
 const second = await f.createThread("alice", { ...submit("second"), channelId: "global", title: "Second" });
 const copy = await f.forward("bob", first.messageId, second.threadId, "legacy-forward");
 f.messages.find(message => message.id === copy.messageId).submissionFingerprint = null;
 f.denyMessage(first.messageId);
 await assert.rejects(f.forward("bob", second.messageId, second.threadId, "legacy-forward"), /DISCUSSION_UNAVAILABLE/);
 f.denyMessage(null);
 await assert.rejects(f.forward("bob", second.messageId, second.threadId, "legacy-forward"), error => {
  assert.equal(error.message, "DISCUSSION_REPLAY_UNVERIFIED");
  assert.equal(error.messageId, copy.messageId);
  return true;
 });
});
