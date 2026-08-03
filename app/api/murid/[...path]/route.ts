import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { env } from "@/lib/env";
import { getMuridDashboardReadModel } from "@/lib/murid/read-model";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (env.FEATURE_MURID_IDEA_WORKFLOW_V1 !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (env.FEATURE_PERAN_V2 === "1" && !(await hasPeran(session.user.id, "murid", { allowAdmin: true }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await context.params;
  const model = await getMuridDashboardReadModel(session.user.id);
  if (path.length === 1 && path[0] === "today") {
    return NextResponse.json({
      courses: model.courses.map((course) => ({ id: course.id, canonicalId: course.canonicalId, title: course.title, enrolledAt: course.enrolledAt })),
      pka: model.pka,
      compatibility: model.compatibility,
    });
  }
  if (path.length === 1 && path[0] === "mastery") {
    return NextResponse.json({
      courses: model.courses.map((course) => ({ id: course.id, title: course.title, ideas: course.ideas })),
      compatibility: model.compatibility,
    });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
