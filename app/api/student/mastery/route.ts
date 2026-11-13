import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { getMastery } from "@/lib/mastery-store";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const access = await resolveCourseAccess({ courseId, userId: session.user.id });
  if (!access.hasFullContentAccess) return NextResponse.json({ error: "Akses mata kuliah tidak tersedia." }, { status: 403 });

  const concepts = await getMastery(session.user.id, courseId);
  return NextResponse.json({ concepts });
}
