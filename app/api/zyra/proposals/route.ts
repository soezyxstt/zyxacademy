import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tutorCourses } from "@/db/schema";
import { auth } from "@/lib/auth";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  createZyraProposal,
  listZyraProposals,
  isZyraProposalFeatureEnabled,
  ZyraProposalDraftSchema,
  type ZyraProposalRole,
} from "@/lib/zyra/proposals";

export const dynamic = "force-dynamic";

function roleForUser(user: { role?: string | null }): ZyraProposalRole | null {
  if (user.role === "admin") return "admin";
  if (user.role === "teacher" || user.role === "tutor") return "tutor";
  return null;
}

async function currentActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const role = roleForUser(session.user as { role?: string | null });
  return role ? { id: session.user.id, role } : null;
}

async function assertTutorCourse(actorId: string, role: ZyraProposalRole, courseId: string | null): Promise<boolean> {
  if (role === "admin") return true;
  if (!courseId) return false;
  const [row] = await db.select({ id: tutorCourses.id }).from(tutorCourses).where(and(
    eq(tutorCourses.tutorId, actorId),
    eq(tutorCourses.courseId, courseId),
  )).limit(1);
  return Boolean(row);
}

function publicProposal(row: Record<string, unknown>) {
  const {
    actorId: _actorId,
    proposerTrace,
    validatorResult,
    scope,
    evidenceRefs,
    preconditionSnapshot,
    operations,
    learnerImpact,
    reversibility,
    warnings,
    ...safe
  } = row;
  return {
    ...safe,
    proposerTrace,
    validatorResult,
    scope,
    evidenceRefs,
    preconditionSnapshot,
    operations,
    learnerImpact,
    reversibility,
    warnings,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const actor = await currentActor();
  if (!actor || !isZyraProposalFeatureEnabled(actor.role, zyraRuntimeEnv)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const courseId = new URL(request.url).searchParams.get("courseId");
  const rows = await listZyraProposals({ actorId: actor.id, role: actor.role, courseId });
  return NextResponse.json({ proposals: rows.map((row) => publicProposal(row as unknown as Record<string, unknown>)) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await currentActor();
  if (!actor || !isZyraProposalFeatureEnabled(actor.role, zyraRuntimeEnv)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  try {
    const draft = ZyraProposalDraftSchema.parse(await request.json());
    if (!(await assertTutorCourse(actor.id, actor.role, draft.courseId))) {
      return NextResponse.json({ error: "COURSE_SCOPE_DENIED" }, { status: 403 });
    }
    const row = await createZyraProposal({ actorId: actor.id, role: actor.role, draft, source: "deterministic" });
    if (!row) return NextResponse.json({ error: "PROPOSAL_NOT_CREATED" }, { status: 500 });
    return NextResponse.json({ proposal: publicProposal(row as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROPOSAL_INVALID";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
