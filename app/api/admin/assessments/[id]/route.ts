import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assessmentSources, assessmentObjects, assessmentSourceChapters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { updateAssessmentProfile } from "@/lib/assessment-extractor";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [source] = await db
    .select()
    .from(assessmentSources)
    .where(eq(assessmentSources.id, id));

  if (!source) {
    return NextResponse.json({ error: "Assessment source not found" }, { status: 404 });
  }

  const courseId = source.courseId;

  // Delete matching objects and chapters
  await db.delete(assessmentObjects).where(eq(assessmentObjects.sourceId, id));
  await db.delete(assessmentSourceChapters).where(eq(assessmentSourceChapters.assessmentSourceId, id));
  await db.delete(assessmentSources).where(eq(assessmentSources.id, id));

  // Update assessment profile
  await updateAssessmentProfile(courseId);

  return NextResponse.json({ success: true });
}
