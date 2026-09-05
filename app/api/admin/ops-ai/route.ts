import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { createOpsAiRuntimeResponse } from "@/lib/admin-ops-ai/runtime";
import { type OpsAiChatRequest } from "@/lib/admin-ops-ai/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const body: OpsAiChatRequest = await req.json();
    const { messages, context } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array cannot be empty" },
        { status: 400 }
      );
    }

    return createOpsAiRuntimeResponse({
      messages,
      context,
      abortSignal: req.signal,
      toolContext: {
        actorId: session.user.id,
        callerRole: "admin",
      },
    });
  } catch (error) {
    console.error("[OpsAi Route Error]:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses permintaan AI." },
      { status: 500 }
    );
  }
}
