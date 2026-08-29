import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
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

async function currentActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const { isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );
  let role: ZyraProposalRole | null = null;
  if (isAdmin) {
    role = "admin";
  } else if (isTutor) {
    role = "tutor";
  }
  return role ? { id: session.user.id, role } : null;
}

async function assertTutorCourse(actorId: string, role: ZyraProposalRole, courseId: string | null): Promise<boolean> {
  if (role === "admin") return true;
  if (!courseId) return false;
  const access = await resolveTutorCourseAccess({
    penggunaId: actorId,
    courseId,
    allowAdmin: false,
  });
  return access.hasAccess;
}

function publicProposal(row: Record<string, unknown>) {
  const { actorId: _actorId, ...safe } = row;
  return safe;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const current = await currentActor();
  const { id } = await params;
  const row = await getZyraProposal(id);
  if (
    !current ||
    !row ||
    !isZyraProposalFeatureEnabled(current.role, zyraRuntimeEnv) ||
    !canAccessZyraProposal({
      actorId: current.id,
      role: current.role,
      proposalActorId: row.actorId,
      courseId: row.courseId,
    }) ||
    !(await assertTutorCourse(current.id, current.role, row.courseId))
  ) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ proposal: publicProposal(row as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const current = await currentActor();
  const { id } = await params;
  const row = await getZyraProposal(id);
  if (
    !current ||
    !row ||
    !isZyraProposalFeatureEnabled(current.role, zyraRuntimeEnv) ||
    !canAccessZyraProposal({
      actorId: current.id,
      role: current.role,
      proposalActorId: row.actorId,
      courseId: row.courseId,
    }) ||
    !(await assertTutorCourse(current.id, current.role, row.courseId))
  ) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { action?: string; preconditionVersion?: number };
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
    return NextResponse.json({ proposal: next ? publicProposal(next as unknown as Record<string, unknown>) : null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROPOSAL_TRANSITION_FAILED";
    const status =
      code === "MUTATION_BOUNDARY_REQUIRED" || code === "PROPOSAL_CONCURRENT_MUTATION"
        ? 409
        : code === "PROPOSAL_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
