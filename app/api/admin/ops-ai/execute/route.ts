import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { executeConfirmedProposal } from "@/lib/admin-ops-ai/tools";
import { type OpsAiActionProposal } from "@/lib/admin-ops-ai/types";

export const dynamic = "force-dynamic";

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
    const body = await req.json();
    const proposal: OpsAiActionProposal = body.proposal;

    if (!proposal || !proposal.type || !proposal.id) {
      return NextResponse.json({ error: "Invalid proposal payload" }, { status: 400 });
    }

    const result = await executeConfirmedProposal(proposal);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Gagal mengeksekusi proposal" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    console.error("[OpsAi Execute Error]:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan sistem saat mengeksekusi aksi." },
      { status: 500 }
    );
  }
}
