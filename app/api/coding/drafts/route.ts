import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { codingDrafts } from "@/db/schema";
import { pythonSourceSchema } from "@/lib/coding/contracts";
import { requireCodingAccess, assertCodingSameOrigin, codingErrorResponse } from "@/lib/coding/server-access";
const bodySchema = z.object({ courseId: z.string().min(1), draftKey: z.string().min(1).max(300), code: pythonSourceSchema, stdin: z.string().max(8_000), revision: z.number().int().nonnegative() }).strict();
export async function GET(request: Request) {
  try {
    const url = new URL(request.url), actor = await requireCodingAccess(request, url.searchParams.get("courseId") ?? "");
    const [draft] = await db.select({ code: codingDrafts.code, stdin: codingDrafts.stdin, revision: codingDrafts.revision }).from(codingDrafts).where(and(eq(codingDrafts.learnerId, actor.userId), eq(codingDrafts.courseId, actor.courseId), eq(codingDrafts.draftKey, url.searchParams.get("draftKey") ?? ""))).limit(1);
    return Response.json({ draft: draft ?? null });
  } catch (error) { return codingErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    assertCodingSameOrigin(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Draft tidak valid." }, { status: 400 });
    const input = parsed.data, actor = await requireCodingAccess(request, input.courseId);
    const where = and(eq(codingDrafts.learnerId, actor.userId), eq(codingDrafts.courseId, actor.courseId), eq(codingDrafts.draftKey, input.draftKey));
    let saved;
    if (!input.revision) {
      [saved] = await db.insert(codingDrafts).values({ learnerId: actor.userId, courseId: actor.courseId, draftKey: input.draftKey, code: input.code, stdin: input.stdin, revision: 1 }).onConflictDoNothing().returning({ revision: codingDrafts.revision });
    } else {
      [saved] = await db.update(codingDrafts).set({ code: input.code, stdin: input.stdin, revision: input.revision + 1, updatedAt: new Date() }).where(and(where, eq(codingDrafts.revision, input.revision))).returning({ revision: codingDrafts.revision });
    }
    if (!saved) return Response.json({ error: "Draft berubah di perangkat lain. Simpan salinan kode sebelum memuat ulang." }, { status: 409 });
    return Response.json(saved);
  } catch (error) { return codingErrorResponse(error); }
}
