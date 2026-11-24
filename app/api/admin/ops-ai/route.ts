import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { createOpsAiRuntimeResponse } from "@/lib/admin-ops-ai/runtime";
import { z } from "zod";
import { OPS_AI_POLICY_BOUNDS } from "@/lib/admin-ops-ai/contracts";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const chatRequest = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(OPS_AI_POLICY_BOUNDS.maxMessageCharLength),
  })).min(1).max(OPS_AI_POLICY_BOUNDS.maxMessagesHistory),
  context: z.object({
    currentPath: z.string().max(512).regex(/^\/admin(?:\/[\w%./-]*)?$/).optional(),
    mode: z.enum(["ask", "edit"]).default("edit"),
    queryParams: z.object({ tab: z.string().regex(/^[\w-]{1,80}$/).optional() }).optional(),
  }).default({ mode: "edit" }),
  chatId: z.string().regex(/^[\w-]{1,100}$/).optional(),
  grantIds: z.array(z.string().regex(/^prop-[a-f0-9-]{36}$/)).max(8).default([]),
});

export async function POST(req: Request) {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    h = req.headers;
  }
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isSameOriginAdminRequest(req, h)) {
      return NextResponse.json({ error: "Buka chat dari halaman admin Zyx." }, { status: 403 });
    }
    const parsed = chatRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
      return NextResponse.json({ error: "Periksa isi pesan dan coba lagi." }, { status: 400 });
    }

    const { messages, context, chatId, grantIds } = parsed.data;
    const browserChat = chatId && session.session?.id
      ? { chatId, grantIds, actorId: session.user.id, sessionId: session.session.id }
      : undefined;
    return createOpsAiRuntimeResponse({
      messages,
      context: {
        currentPath: context.currentPath ?? "/admin",
        mode: context.mode,
        ...(context.queryParams?.tab ? { queryParams: { tab: context.queryParams.tab } } : {}),
      },
      browserChat,
      ...(browserChat ? { maxToolSteps: 8, maxConsecutiveToolCalls: 8 } : {}),
      abortSignal: req.signal,
      toolContext: {
        actorId: session.user.id,
        callerRole: "admin",
      },
    });
  } catch {
    console.error("[OpsAi Chat] Unexpected request failure");
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses permintaan AI." },
      { status: 500 }
    );
  }
}
