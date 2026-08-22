import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseMaterials } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const BodySchema = z.object({
  courseId: z.string().min(1),
  checksums: z.array(z.string().length(64)).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, checksums } = parsed.data;

  const rows = await db
    .select({
      id: courseMaterials.id,
      title: courseMaterials.title,
      checksum: courseMaterials.checksum,
    })
    .from(courseMaterials)
    .where(
      and(
        eq(courseMaterials.courseId, courseId),
        inArray(courseMaterials.checksum, checksums)
      )
    );

  const duplicates: Record<string, { materialId: string; title: string }> = {};
  for (const row of rows) {
    if (row.checksum) duplicates[row.checksum] = { materialId: row.id, title: row.title };
  }

  return NextResponse.json({ duplicates });
}
