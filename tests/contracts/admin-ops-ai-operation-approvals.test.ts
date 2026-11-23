import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";

// Run in an isolated Bun process. Both DB entry points use an in-memory fixture.
const { client, testDb: db } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
const origin = "http://localhost:3100";
process.env.BETTER_AUTH_URL = origin;
process.env.NEXT_PUBLIC_APP_URL = origin;
process.env.ZYX_MCP_ENVIRONMENT = "local";
process.env.BETTER_AUTH_SECRET = "local-only-ops-ai-approval-fixture";
const { browserOperations } = await import("@/lib/admin-ops-ai/registered-operations");
const { createBrowserOperationTools } = await import("@/lib/admin-ops-ai/operation-tools");
const { confirmAdminOperation, revokeChatOperationGrants, readApprovedOperation } = await import("@/lib/admin-ops-ai/operation-approvals");
const { opsGrantTarget } = await import("@/lib/admin-ops-ai/operation-policy");
const { getZyraProposal, listZyraProposals, transitionZyraProposal } = await import("@/lib/zyra/proposals/service");
const { proposalStore } = await import("@/lib/admin-ops-ai/proposal-store");

const actorId = "ops-admin";
const chat = { actorId, sessionId: "test-auth-session", chatId: "test-conversation", grantIds: [] as string[] };
const questions = [{ title: "Nama", type: "TEXT" as const }];
const options = { toolCallId: "fixture-tool-call", messages: [] };
const environment = { expectedEnvironment: "local", expectedOrigin: origin };

beforeAll(async () => {
  await db.insert(schema.user).values({ id: actorId, name: "Admin", email: "ops-admin@example.test", role: "admin" });
  await db.insert(schema.pengguna).values({ id: actorId });
  await seedAdminMcpAuthority(db, adminMcpTestPrincipal({ ...chat, userId: actorId, authMethod: "session", scopes: [] }));
  await db.insert(schema.mataKuliah).values({ id: "approval-fixture", code: "TEST-APPROVAL", title: "Mata kuliah fixture" });
  await db.insert(schema.customFormPresets).values([
    { id: "preset-a", name: "Preset A", questions, settings: {}, createdById: actorId },
    { id: "preset-b", name: "Preset B", questions, settings: {}, createdById: actorId },
  ]);
});
afterAll(async () => { await client.close(); });

const registry = browserOperations(chat);

async function preset(id: string) {
  const result = await registry.get("forms.presets.get")!.invoke({ id, ...environment });
  expect(result.structuredContent?.ok).toBe(true);
  return result.structuredContent?.data as { revision: string; name: string };
}

async function useOperation(operation: string, input: Record<string, unknown>, browserChat = chat) {
  const tool = createBrowserOperationTools(browserChat, "fixture-run", true).use_admin_operation;
  return await tool.execute!({ operation, argumentsJson: JSON.stringify(input) }, options) as {
    summary: string;
    proposal?: { id: string; approval?: "chat" | "once" };
  };
}

test("discovery applies the browser policy to actual MCP operations", () => {
  expect(registry.size).toBeGreaterThan(170);
  expect(registry.get("workflow.get_playbook")?.policy).toBe("read");
  expect(registry.get("source.ingest")?.protocol).toBe("direct");
  expect(registry.get("authoring.publish_release")?.policy).toBe("once");
  expect(registry.has("quiz.set_questions")).toBe(true);
  expect(registry.get("forms.presets.update")?.policy).toBe("chat");
  expect(registry.get("forms.presets.delete")?.policy).toBe("once");
  expect(registry.get("blog.update")?.policy).toBe("draft-only");
  expect(registry.has("tokens.reveal")).toBe(false);
  expect(registry.has("forms.responses.get")).toBe(false);
  expect(registry.has("meet.end")).toBe(false);
  expect(registry.get("forms.presets.update")?.input.shape.confirmationToken).toBeUndefined();
  expect(registry.get("users.get")?.input.shape.includeEmail).toBeUndefined();
  expect(opsGrantTarget("blog.update", { id: "blog-a" }, { previousStatus: "published", isPublic: true })).toBeUndefined();
  expect(opsGrantTarget("blog.update", { id: "blog-a" }, { previousStatus: "draft", isPublic: false })).toBe("blog-a");
});

test("server approval is scoped to the original session, chat, action and target", async () => {
  const previous = await preset("preset-a");
  const prepared = await useOperation("forms.presets.update", { id: "preset-a", expectedRevision: previous.revision, name: "Perubahan pertama", questions });
  expect(prepared.proposal?.approval).toBe("chat");
  expect(JSON.stringify(prepared)).not.toContain("confirmationToken");
  const id = prepared.proposal!.id;
  expect(await getZyraProposal(id)).toBeNull();
  expect(await listZyraProposals({ actorId, role: "admin" })).toEqual([]);
  await expect(transitionZyraProposal({ id, actorId, to: "confirmed", preconditionVersion: 1 })).rejects.toThrow("PROPOSAL_NOT_FOUND");
  expect((await preset("preset-a")).name).toBe(previous.name);
  expect((await confirmAdminOperation({ ...chat, actorId: "other-admin" }, id, chat.chatId, "chat")).success).toBe(false);
  expect((await confirmAdminOperation({ ...chat, sessionId: "other-session" }, id, chat.chatId, "chat")).success).toBe(false);
  expect((await confirmAdminOperation(chat, id, "other-chat", "chat")).success).toBe(false);
  expect((await confirmAdminOperation(chat, id, chat.chatId, "chat")).success).toBe(true);
  expect((await confirmAdminOperation(chat, id, chat.chatId, "chat")).success).toBe(true);
  expect(await db.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.action, "forms.presets.update"))).toHaveLength(1);
  const current = await preset("preset-a");
  expect(current.name).toBe("Perubahan pertama");

  const granted = { ...chat, grantIds: [id] };
  const revision = { id: "preset-a", expectedRevision: current.revision, name: "Perubahan berikutnya", questions };
  expect((await useOperation("forms.presets.update", revision, { ...granted, chatId: "other-chat" })).proposal).toBeDefined();
  const other = await preset("preset-b");
  expect((await useOperation("forms.presets.update", { ...revision, id: "preset-b", expectedRevision: other.revision }, granted)).proposal).toBeDefined();
  expect((await useOperation("forms.presets.update", revision, granted)).summary).toBe("Aksi selesai dengan izin chat.");

  const updated = await preset("preset-a");
  const deletion = await useOperation("forms.presets.delete", { id: "preset-a", expectedRevision: updated.revision }, granted);
  expect(deletion.proposal?.approval).toBe("once");
  expect((await confirmAdminOperation(chat, deletion.proposal!.id, chat.chatId, "chat")).success).toBe(false);

  await revokeChatOperationGrants(granted);
  const after = await useOperation("forms.presets.update", { ...revision, expectedRevision: updated.revision }, granted);
  expect(after.proposal?.approval).toBe("chat");
  expect((await confirmAdminOperation(chat, deletion.proposal!.id, chat.chatId, "once")).success).toBe(true);
  expect(await db.select().from(schema.customFormPresets).where(eq(schema.customFormPresets.id, "preset-a"))).toHaveLength(0);
});

test("a draft editing grant cannot authorize publication or editing the published article", async () => {
  const create = await useOperation("blog.create", { title: "Artikel fixture", content: "# Artikel fixture\n\nKonten uji." });
  const created = await confirmAdminOperation(chat, create.proposal!.id, chat.chatId, "once");
  expect(created.success).toBe(true);
  const [article] = await db.select().from(schema.blogArticles).where(eq(schema.blogArticles.slug, "artikel-fixture"));
  const blog = async () => {
    const result = await registry.get("blog.get")!.invoke({ id: article.id, ...environment });
    expect(result.structuredContent?.ok).toBe(true);
    return result.structuredContent?.data as { revision: string; status: string; title: string };
  };
  const initial = await blog();
  const draftEdit = await useOperation("blog.update", { id: article.id, expectedRevision: initial.revision, changes: { title: "Draf berikutnya" } });
  expect(draftEdit.proposal?.approval).toBe("chat");
  expect((await confirmAdminOperation(chat, draftEdit.proposal!.id, chat.chatId, "chat")).success).toBe(true);
  const granted = { ...chat, grantIds: [draftEdit.proposal!.id] };
  const draft = await blog();
  const disclosure = await useOperation("blog.set_publication", { id: article.id, expectedRevision: draft.revision, published: true }, granted);
  expect(disclosure.proposal?.approval).toBe("once");
  expect((await confirmAdminOperation(chat, disclosure.proposal!.id, chat.chatId, "once")).success).toBe(true);
  const published = await blog();
  expect(published.status).toBe("published");
  const liveEdit = await useOperation("blog.update", { id: article.id, expectedRevision: published.revision, changes: { title: "Edit publik" } }, granted);
  expect(liveEdit.proposal?.approval).toBe("once");
  expect((await blog()).title).toBe(draft.title);
});

test("authoring uses MCP choices and playbooks, then continues from a chat-scoped approval result", async () => {
  const choices = await registry.get("catalog.list_courses")!.invoke({});
  const course = (choices.structuredContent?.choices as Array<{key: string; label: string}>).find(choice => choice.label === "Mata kuliah fixture")!;
  const playbook = await registry.get("workflow.get_playbook")!.invoke({ skill: "reference-question-ingest", bootstrapProtocol: 1, stage: "reference" });
  const bootstrapToken = playbook.structuredContent?.bootstrapToken;
  expect(typeof bootstrapToken).toBe("string");
  const prepared = await useOperation("workflow.start", { workflow: "reference_question_ingest", courseKey: course.key, bootstrapToken });
  expect(prepared.proposal?.approval).toBe("once");
  expect(JSON.stringify(prepared)).toContain("approval-fixture");
  expect(JSON.stringify(prepared)).not.toContain(course.key);
  const proposalId = prepared.proposal!.id;
  expect((await confirmAdminOperation(chat, proposalId, chat.chatId, "chat")).success).toBe(false);
  expect((await confirmAdminOperation(chat, proposalId, chat.chatId, "once")).success).toBe(true);
  const receipt = await readApprovedOperation(chat, proposalId);
  expect(receipt?.status).toBe("applied");
  const runToken = (receipt?.data as { runToken: string }).runToken;
  expect(typeof runToken).toBe("string");
  const activeRun = await registry.get("workflow.get_run")!.invoke({ runToken });
  expect(activeRun.structuredContent?.ok).toBe(true);
  expect(await readApprovedOperation({ ...chat, chatId: "other-chat" }, proposalId)).toBeNull();
  expect((await confirmAdminOperation(chat, proposalId, chat.chatId, "once")).success).toBe(true);
  expect(await readApprovedOperation(chat, proposalId)).toEqual(receipt);
  const uncertain = await useOperation("workflow.start", { workflow: "reference_question_ingest", courseKey: course.key, bootstrapToken });
  await db.update(schema.zyraProposals).set({
    status: "confirmed",
    reversibility: { approval: "once" },
  }).where(eq(schema.zyraProposals.id, uncertain.proposal!.id));
  expect(await confirmAdminOperation(chat, uncertain.proposal!.id, chat.chatId, "once")).toMatchObject({ success: false, retryable: false });
});

test("obsolete revisions cannot commit and a chat grant cannot survive session revocation", async () => {
  const previous = await preset("preset-b");
  const prepare = (name: string) => useOperation("forms.presets.update", { id: "preset-b", expectedRevision: previous.revision, name, questions });
  const older = await prepare("Old proposal");
  const newer = await prepare("New proposal");
  expect((await confirmAdminOperation(chat, newer.proposal!.id, chat.chatId, "chat")).success).toBe(true);
  expect((await confirmAdminOperation(chat, older.proposal!.id, chat.chatId, "once")).success).toBe(false);
  const current = await preset("preset-b");
  expect(current.name).toBe("New proposal");
  proposalStore.clearInMemoryCacheOnly();
  await db.delete(schema.session).where(eq(schema.session.id, chat.sessionId));
  const result = await useOperation("forms.presets.update", { id: "preset-b", expectedRevision: current.revision, name: "Revoked", questions }, { ...chat, grantIds: [newer.proposal!.id] });
  expect(result.summary).toBe("Aksi belum dapat disiapkan.");
  const [row] = await db.select().from(schema.customFormPresets).where(eq(schema.customFormPresets.id, "preset-b"));
  expect(row.name).toBe("New proposal");
});
