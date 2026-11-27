import { randomUUID } from "node:crypto";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type { OpsAiActionProposalV2 } from "@/lib/admin-ops-ai/chat-contract";
import type { ExecuteOpsAiRuntimeOptions } from "@/lib/admin-ops-ai/runtime";
import { assertFixtureRunner } from "./scope";

const formSlug = "native-preview-ops-ai";
const askPrompt = "Ringkas formulir preview";
const actionPrompt = "Siapkan formulir preview tertutup";

export async function loadOpsAiPreview() {
  assertFixtureRunner();
  const [{ createBrowserOperationTools }, { db }, { customForms }] = await Promise.all([
    import("@/lib/admin-ops-ai/operation-tools"), import("@/db"), import("@/db/schema"),
  ]);
  let chatId = "";
  let actorId = "";
  let proposalId = "";
  let confirmed = false;
  let asked = false;

  // The provider is synthetic. Authentication, the operation plan, proposal
  // receipt, and database mutation run through the actual Admin handlers.
  mock.module("@/lib/admin-ops-ai/runtime", () => ({
    async createOpsAiRuntimeResponse(options: ExecuteOpsAiRuntimeOptions) {
      const { browserChat, context } = options;
      const prompt = options.messages.at(-1)?.content;
      if (!browserChat || browserChat.grantIds.length || context?.currentPath !== "/admin/forms") return new Response(null, { status: 400 });
      const parts: unknown[] = [];
      if (context.mode === "ask" && prompt === askPrompt && !asked) {
        asked = true;
        chatId = browserChat.chatId;
        actorId = browserChat.actorId;
        parts.push({ type: "text-delta", textDelta: "Formulir preview " }, { type: "text-delta", textDelta: "tersedia." });
      } else if (context.mode === "edit" && prompt === actionPrompt && asked && !proposalId &&
          chatId === browserChat.chatId && actorId === browserChat.actorId) {
        const runId = randomUUID();
        const tool = createBrowserOperationTools(browserChat, runId, true).use_admin_operation;
        const plan = await tool.execute?.({ operation: "forms.create", argumentsJson: JSON.stringify({
          definition: {
            title: "Expo Ops AI Approved Form",
            slug: formSlug,
            category: "survey",
            questions: [{ type: "TEXT", title: "Preview field" }],
            settings: { acceptingResponses: false },
          },
        }) }, { toolCallId: runId, messages: [], abortSignal: options.abortSignal });
        const proposal = (plan as { proposal?: OpsAiActionProposalV2 } | undefined)?.proposal;
        if (!proposal || proposal.approval !== "once") return new Response(null, { status: 500 });
        proposalId = proposal.id;
        parts.push({ type: "text-delta", textDelta: "Periksa rencana formulir." }, { type: "data-proposal", id: proposal.id, data: proposal });
      } else {
        return new Response(null, { status: 400 });
      }

      const encoder = new TextEncoder();
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          const part = parts.shift();
          if (part) {
            await Bun.sleep(70);
            controller.enqueue(encoder.encode("data: " + JSON.stringify(part) + "\n\n"));
          } else {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store" } });
    },
  }));

  const [{ POST: chat }, { POST: execute }] = await Promise.all([
    import("@/app/api/admin/ops-ai/route"), import("@/app/api/admin/ops-ai/execute/route"),
  ]);

  return {
    async handle(request: NextRequest) {
      const path = request.nextUrl.pathname;
      if (path === "/api/admin/ops-ai") return chat(request);
      if (path !== "/api/admin/ops-ai/execute") return;
      const body = await request.clone().json().catch(() => null);
      const response = await execute(request);
      if (response.ok && body?.proposalId === proposalId && body.chatId === chatId && body.choice === "once") confirmed = true;
      return response;
    },
    async verified() {
      if (!asked || !confirmed) return false;
      const [form] = await db.select().from(customForms).where(eq(customForms.slug, formSlug)).limit(1);
      return form?.createdById === actorId && form.settings?.acceptingResponses === false;
    },
  };
}
