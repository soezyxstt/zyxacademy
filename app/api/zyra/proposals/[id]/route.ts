import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  canAccessZyraProposal,
  getZyraProposal,
  isZyraProposalFeatureEnabled,
  transitionZyraProposal,
  type ZyraProposalRole,
  type ZyraProposalStatus,
} from "@/lib/zyra/proposals";

export const dynamic = "force-dynamic";

function roleForUser(user: { role?: string | null }): ZyraProposalRole | null {
  if (user.role === "admin") return "admin";
  if (user.role === "teacher" || user.role === "tutor") return "tutor";
  return null;
}

async function actor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const role = roleForUser(session.user as { role?: string | null });
  return role ? { id: session.user.id, role } : null;
}

function publicProposal(row: Record<string, unknown>) {
  const { actorId: _actorId, ...safe } = row;
  return safe;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const current = await actor();
  const { id } = await params;
  const row = await getZyraProposal(id);
  if (!current || !row || !isZyraProposalFeatureEnabled(current.role, zyraRuntimeEnv) || !canAccessZyraProposal({
    actorId: current.id,
    role: current.role,
    proposalActorId: row.actorId,
    courseId: row.courseId,
  })) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ proposal: publicProposal(row as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const current = await actor();
  const { id } = await params;
  const row = await getZyraProposal(id);
  if (!current || !row || !isZyraProposalFeatureEnabled(current.role, zyraRuntimeEnv) || !canAccessZyraProposal({
    actorId: current.id,
    role: current.role,
    proposalActorId: row.actorId,
    courseId: row.courseId,
  })) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const body = await request.json() as { action?: string; preconditionVersion?: number };
    const actionMap: Record<string, ZyraProposalStatus> = {
      review: "reviewed",
      confirm: "confirmed",
      reject: "rejected",
      expire: "expired",
      apply: "applied",
    };
    const to = body.action ? actionMap[body.action] : undefined;
    if (!to || typeof body.preconditionVersion !== "number" || !Number.isInteger(body.preconditionVersion)) {
      return NextResponse.json({ error: "INVALID_PROPOSAL_ACTION" }, { status: 400 });
    }
    const next = await transitionZyraProposal({ id, actorId: current.id, to, preconditionVersion: body.preconditionVersion });
    return NextResponse.json({ proposal: next });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROPOSAL_TRANSITION_FAILED";
    const status = code === "MUTATION_BOUNDARY_REQUIRED" ? 409 : code === "PROPOSAL_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
