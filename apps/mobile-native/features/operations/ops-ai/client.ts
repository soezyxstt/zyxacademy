import type { NativeSessionTransport } from "../../../network/transport";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "../../../auth/login-intent";
import { OpsAiCitationSchema, type OpsAiCitation, type OpsAiActionProposalV2 } from "../../../../../lib/admin-ops-ai/chat-contract";

export type ApprovalChoice = "once" | "chat";
export type ApprovalReply = {
  success?: boolean;
  error?: string;
  retryable?: boolean;
  grantUntil?: number;
  result?: { message?: string; token?: string; target?: string; jobId?: string };
};

export function opsChatContext(href: string, mode: "ask" | "edit") {
  const url = new URL(href, "https://native.invalid");
  const path = url.pathname;
  const tab = url.searchParams.get("tab");
  return {
    currentPath: path.length <= 512 && /^\/admin(?:\/[\w%./-]*)?$/.test(path) ? path : "/admin",
    mode,
    ...(tab && /^[\w-]{1,80}$/.test(tab) ? { queryParams: { tab } } : {}),
  };
}

export function opsCitationDestination(
  citation: OpsAiCitation,
  account: Parameters<typeof resolveNativeProtectedDestination>[1],
  sitemap: NativeRouteNode | null,
) {
  const parsed = OpsAiCitationSchema.safeParse(citation);
  if (!parsed.success || parsed.data.source !== "live-tool" || parsed.data.availability !== "available") return null;
  const url = parsed.data.url;
  if (!url?.startsWith("/admin/")) return null;
  const target = resolveNativeProtectedDestination(url, account, sitemap);
  return target?.area === "admin" ? target.href : null;
}

export function approvalPayload(proposal: OpsAiActionProposalV2, chatId: string, choice: ApprovalChoice) {
  if (proposal.type === "admin_operation") {
    if (!proposal.approval || (choice === "chat" && proposal.approval !== "chat")) throw new Error("Invalid approval");
    return { proposalId: proposal.id, chatId, choice };
  }
  if (choice !== "once") throw new Error("Invalid approval");
  return { proposalId: proposal.id };
}

export function createOpsAiClient(session: NativeSessionTransport) {
  return {
    request(path: string, init: RequestInit) {
      const headers = new Headers(init.headers);
      headers.set("Origin", session.scope.origin);
      headers.set("Accept", "text/event-stream");
      return session.request(path, { ...init, headers, requiredRole: "admin" });
    },
    async execute(payload: ReturnType<typeof approvalPayload> | { chatId: string; revokeGrantIds: string[] }, signal: AbortSignal) {
      const response = await session.request("/api/admin/ops-ai/execute", {
        method: "POST", signal, requiredRole: "admin",
        headers: { "Content-Type": "application/json", Accept: "application/json", Origin: session.scope.origin },
        body: JSON.stringify(payload),
      });
      try {
        const status = response.status;
        const data = await response.json().catch(() => null) as ApprovalReply | null;
        session.assertCurrent();
        return { ok: status >= 200 && status < 300 && data?.success === true, status, data };
      } finally {
        response.dispose();
      }
    },
  };
}
