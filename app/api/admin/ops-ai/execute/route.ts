import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { proposalStore } from "@/lib/admin-ops-ai/proposal-store";

export const dynamic = "force-dynamic";

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
    const body = await req.json();
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
  } catch (error) {
    console.error("[OpsAi Execute Error]:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan sistem saat mengeksekusi aksi.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
