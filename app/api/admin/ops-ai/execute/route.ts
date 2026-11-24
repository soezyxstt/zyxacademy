import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { z } from "zod";
import { proposalStore } from "@/lib/admin-ops-ai/proposal-store";

export const dynamic = "force-dynamic";

const chatIdSchema = z.string().regex(/^[\w-]{1,100}$/);
const revokeSchema = z.strictObject({
  chatId: chatIdSchema,
  revokeGrantIds: z.array(z.string().regex(/^prop-[a-f0-9-]{36}$/)).min(1).max(8),
});
const approvalSchema = z.strictObject({
  proposalId: z.string().regex(/^prop-[a-f0-9-]{36}$/),
  chatId: chatIdSchema,
  choice: z.enum(["once", "chat"]),
});

export async function POST(req: Request) {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    h = req.headers;
  }

  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized: sesi pengguna tidak ditemukan.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const isAuthorized = await hasPeran(session.user.id, "admin");

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: role admin diperlukan untuk mengeksekusi proposal aksi.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    const fetchSite = req.headers.get("sec-fetch-site");
    const origin = req.headers.get("origin");
    if ((fetchSite && fetchSite !== "same-origin") || (origin && origin !== new URL(req.url).origin)) {
      return NextResponse.json({ error: "Persetujuan harus diberikan dari halaman admin Zyx." }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Persetujuan tidak valid." }, { status: 400 });
    }
    const sessionId = session.session?.id;
    const fromBrowser = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";
    if ("revokeGrantIds" in body) {
      const parsed = revokeSchema.safeParse(body);
      if (!parsed.success || !sessionId || !fromBrowser) {
        return NextResponse.json({ error: "Izin chat tidak valid." }, { status: 400 });
      }
      const { revokeChatOperationGrants } = await import("@/lib/admin-ops-ai/operation-approvals");
      await revokeChatOperationGrants({
        actorId: session.user.id,
        sessionId,
        chatId: parsed.data.chatId,
        grantIds: parsed.data.revokeGrantIds,
      });
      return NextResponse.json({ success: true });
    }
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";

    if (!proposalId) {
      return NextResponse.json(
        { error: "Parameter 'proposalId' wajib disertakan.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    // Strictly lookup proposal from server store; browser-supplied proposal payloads are never trusted
    const stored = await proposalStore.getProposal(proposalId);
    if (!stored) {
      return NextResponse.json(
        { error: `Proposal '${proposalId}' tidak ditemukan di server.`, code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (stored.type === "admin_operation") {
      const parsed = approvalSchema.safeParse(body);
      if (!parsed.success || !sessionId || !fromBrowser) {
        return NextResponse.json({ error: "Persetujuan tidak valid." }, { status: 400 });
      }
      const { confirmAdminOperation } = await import("@/lib/admin-ops-ai/operation-approvals");
      const result = await confirmAdminOperation(
        { actorId: session.user.id, sessionId },
        parsed.data.proposalId,
        parsed.data.chatId,
        parsed.data.choice,
      );
      return NextResponse.json({ ...result, proposalId }, { status: result.success ? 200 : 409 });
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined;

    const executionResult = await proposalStore.executeProposal({
      proposalId,
      actorId: session.user.id,
      idempotencyKey,
    });

    if (!executionResult.success) {
      const statusCode = executionResult.errorCode === "STALE_PRECONDITION" ? 409 : 400;
      return NextResponse.json(
        {
          error: executionResult.error || "Gagal mengeksekusi proposal.",
          code: executionResult.errorCode || "EXECUTION_FAILED",
        },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      proposalId: stored.id,
      result: executionResult.result,
      idempotent: executionResult.idempotent,
    });
  } catch {
    console.error("[OpsAi Execute] Unexpected operation failure");
    return NextResponse.json(
      { error: "Hasil aksi belum terverifikasi. Periksa kembali persetujuan atau target.", code: "INTERNAL_ERROR", retryable: true },
      { status: 500 }
    );
  }
}
