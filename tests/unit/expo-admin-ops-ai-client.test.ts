import { expect, test } from "bun:test";
import { approvalPayload, createOpsAiClient, opsChatContext } from "../../apps/mobile-native/features/operations/ops-ai/client";
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
