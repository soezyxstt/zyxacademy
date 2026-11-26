import { expect, test } from "bun:test";
import { approvalPayload, createOpsAiClient, opsChatContext, opsCitationDestination } from "../../apps/mobile-native/features/operations/ops-ai/client";
import {
  beginOpsAiApproval, liveOpsAiGrants, newOpsAiChat, opsAiHistoryKey, readOpsAiHistory, redactOpsAiTokens, removeOpsAiHistory, serializeOpsAiHistory,
} from "../../apps/mobile-native/features/operations/ops-ai/history";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import type { OpsAiActionProposalV2 } from "../../lib/admin-ops-ai/contracts";

const origin = "https://preview.example";
const proposal = {
  id: "prop-00000000-0000-4000-8000-000000000000", runId: "run", stepId: "step",
  type: "admin_operation", status: "pending", approval: "chat", title: "An operation",
  description: "Review before acting", preview: { summary: "Target" }, createdAt: 1,
} satisfies OpsAiActionProposalV2;

test("native Ops AI scopes page context to the canonical Admin path and tab", () => {
  expect(opsChatContext("/admin/questions?tab=historical&query=private", "ask")).toEqual({
    currentPath: "/admin/questions", mode: "ask", queryParams: { tab: "historical" },
  });
  expect(opsChatContext("/settings?tab=%3Cbad%3E", "edit")).toEqual({ currentPath: "/admin", mode: "edit" });
});

test("native Ops AI confirms using only the stored proposal and permitted approval identity", () => {
  expect(approvalPayload(proposal, "chat-1", "chat")).toEqual({ proposalId: proposal.id, chatId: "chat-1", choice: "chat" });
  expect(approvalPayload({ ...proposal, type: "create_token", approval: undefined }, "chat-1", "once")).toEqual({ proposalId: proposal.id });
  expect(() => approvalPayload({ ...proposal, approval: "once" }, "chat-1", "chat")).toThrow();
  expect(() => approvalPayload({ ...proposal, approval: undefined }, "chat-1", "once")).toThrow();
});

test("native Ops AI sends signed SSE and approvals to the bound origin with the Admin gate", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let authorized = true;
  const transport = createNativeTransport({ origin, fetcher: async (url, init) => {
    calls.push({ url, init });
    return url.endsWith("/execute") ? Response.json({ success: true, grantUntil: 123 }) :
      new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }}).setSession({
    origin, accountId: "account", sessionId: "session", readCookie: () => "session=fake",
    canStartRequest: (method, role) => authorized && method === "POST" && role === "admin",
  });
  const client = createOpsAiClient(transport);
  const request = await client.request("/api/admin/ops-ai", { method: "POST", body: "{}" });
  expect(await request.text()).toBe("data: [DONE]\n\n");
  request.dispose();
  expect(await client.execute(approvalPayload(proposal, "chat-1", "once"), new AbortController().signal))
    .toEqual({ ok: true, status: 200, data: { success: true, grantUntil: 123 } });
  expect(calls.map(call => call.url)).toEqual([origin + "/api/admin/ops-ai", origin + "/api/admin/ops-ai/execute"]);
  for (const { init } of calls) {
    expect(new Headers(init.headers).get("Origin")).toBe(origin);
    expect(new Headers(init.headers).get("Cookie")).toBe("session=fake");
    expect(init.redirect).toBe("manual");
  }
  authorized = false;
  await expect(client.execute({ chatId: "chat-1", revokeGrantIds: [proposal.id] }, new AbortController().signal)).rejects.toThrow();
  expect(calls).toHaveLength(2);
});

test("journal resumes the exact uncertain approval without reopening its first confirmation", () => {
  const original = {
    ...newOpsAiChat("chat-1"),
    messages: [{ id: "message", role: "assistant" as const, content: "Review", createdAt: 1, proposals: [{ ...proposal, expiresAt: 100 }] }],
    proposals: { [proposal.id]: { sessionId: "session-1" } },
  };
  const attempted = beginOpsAiApproval(original, proposal, "session-1", "chat", false, 2);
  expect(attempted).toBeTruthy();
  const stored = serializeOpsAiHistory({ activeId: original.id, chats: [{ ...original, proposals: attempted! }] });
  const [resumed] = readOpsAiHistory(stored, newOpsAiChat("new-chat")).chats;
  expect(beginOpsAiApproval(resumed, proposal, "session-1", "once", true, 2)).toBeNull();
  expect(beginOpsAiApproval(resumed, proposal, "session-2", "chat", true, 2)).toBeNull();
  expect(beginOpsAiApproval(resumed, proposal, "session-1", "chat", false, 2)).toBeNull();
  const expired = resumed.messages[0].proposals![0];
  expect(beginOpsAiApproval(original, expired, "session-1", "chat", false, 100)).toBeNull();
  expect(beginOpsAiApproval(resumed, expired, "session-1", "chat", true, 101)).toEqual(attempted!);
  expect(approvalPayload(expired, resumed.id, "chat")).toEqual(approvalPayload(proposal, original.id, "chat"));
});

test("history keeps account and origin separate and redacts tokens from all persisted message fields", () => {
  const base = { origin, accountId: "account-a" };
  expect(opsAiHistoryKey(base)).not.toBe(opsAiHistoryKey({ ...base, accountId: "account-b" }));
  expect(opsAiHistoryKey(base)).not.toBe(opsAiHistoryKey({ ...base, origin: "https://different.example" }));

  const token = "Zyx-A1B2C3D4-2-1";
  expect(redactOpsAiTokens("Streaming " + token.slice(0, -3))).toBe("Streaming [token]");
  expect(redactOpsAiTokens("Streaming " + token.slice(0, 9))).toBe("Streaming [token]");
  const chat = {
    ...newOpsAiChat("saved-chat"),
    mode: "edit" as const,
    title: "Token " + token,
    messages: [{ id: "message", role: "assistant" as const, content: token, createdAt: 1,
      proposals: [{ ...proposal, preview: { summary: token } }] }],
    proposals: { [proposal.id]: { sessionId: "session-1", outcome: { state: "done" as const, message: token, token }, grantUntil: 50 } },
  };
  const saved = serializeOpsAiHistory({ activeId: chat.id, chats: [chat] });
  expect(saved).not.toContain(token);
  const [restored] = readOpsAiHistory(saved, newOpsAiChat("blank")).chats;
  expect(restored.title).toBe("Token [token]");
  expect(restored.messages[0].proposals?.[0].preview.summary).toBe("[token]");
  expect(restored.proposals[proposal.id].outcome).toEqual({ state: "done", message: "[token]" });
  expect(restored.mode).toBe("edit");
  expect(liveOpsAiGrants(restored, "session-1", 49)).toEqual([proposal.id]);
  expect(liveOpsAiGrants(restored, "session-1", 50)).toEqual([]);
  expect(liveOpsAiGrants(restored, "session-2", 49)).toEqual([]);
});

test("clear replaces the chat identity and permissions, delete preserves other chats, and clear all resets the book", () => {
  const blank = newOpsAiChat("fresh-chat");
  const first = { ...newOpsAiChat("chat-1"), proposals: { [proposal.id]: { sessionId: "session-1", grantUntil: 50 } } };
  const other = newOpsAiChat("chat-2");
  const saved = { activeId: first.id, chats: [first, other] };
  expect(removeOpsAiHistory(saved, { type: "delete", id: other.id }, blank)).toEqual({ activeId: first.id, chats: [first] });
  expect(removeOpsAiHistory(saved, { type: "delete", id: first.id }, blank)).toEqual({ activeId: other.id, chats: [other] });
  expect(removeOpsAiHistory(saved, { type: "clear", id: first.id }, blank)).toEqual({ activeId: blank.id, chats: [blank, other] });
  expect(removeOpsAiHistory(saved, { type: "all" }, blank)).toEqual({ activeId: blank.id, chats: [blank] });
});

test("only available navigation citations for mounted native Admin routes get a link", () => {
  const sitemap = { contextKey: "root", href: "/", isGenerated: false, isInternal: false, children: [
    { contextKey: "questions", href: "/(operations)/admin/questions", isGenerated: false, isInternal: false, children: [] },
  ] };
  const admin = { roles: ["admin" as const] };
  const citation = {
    id: "source", sourceId: "questions", source: "live-tool" as const, availability: "available" as const,
    runId: "run", stepId: "step", title: "Question bank", snippet: "Manage questions", url: "/admin/questions?tab=historical",
  };
  expect(opsCitationDestination(citation, admin, sitemap)).toBe(citation.url);
  for (const url of ["/admin", "/admin/unknown", "/admin/jobs", "//example.com/admin/questions", "https://example.com/admin/questions", "/admin/%2e%2e/dashboard"]) {
    expect(opsCitationDestination({ ...citation, url }, admin, sitemap)).toBeNull();
  }
  expect(opsCitationDestination({ ...citation, source: "semantic-rag" }, admin, sitemap)).toBeNull();
  expect(opsCitationDestination({ ...citation, availability: "stale" }, admin, sitemap)).toBeNull();
  expect(opsCitationDestination(citation, { roles: ["tutor"] }, sitemap)).toBeNull();
});
