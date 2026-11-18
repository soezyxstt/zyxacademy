import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { updateMaterialProgress } from "@/lib/material-progress.repository";
import { materialProgressInputSchema } from "@/lib/materials/client-contracts";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expectedUserId = req.headers.get("x-student-id");
  if (expectedUserId && expectedUserId !== session.user.id) {
    return NextResponse.json({ error: "Account changed" }, { status: 409 });
  }

  try {
    const body = await req.json();
    const parsed = materialProgressInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const studentId = session.user.id;
    const { materialId, completionPercent, lastSectionId, lastPosition, timeSpentSeconds } = parsed.data;

    const result = await updateMaterialProgress({
      studentId,
      materialId,
      completionPercent,
      lastSectionId: lastSectionId || null,
      lastPosition: lastPosition || null,
      timeSpentSeconds,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("POST /api/student/material-progress error:", error);
    if (error?.message === "MATERIAL_ACCESS_DENIED") {
      return NextResponse.json({ error: "Progres materi tidak dapat disimpan." }, { status: 403 });
    }
    if (error?.message === "MATERIAL_UPGRADE_REQUIRED") {
      return NextResponse.json({ error: "Materi ini belum tersedia di paket Free." }, { status: 403 });
    }
    return NextResponse.json({ error: "Progres materi tidak dapat disimpan saat ini." }, { status: 500 });
  }
}
