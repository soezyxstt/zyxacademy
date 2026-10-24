import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { artikel, blokArtikel } from "@/db/schema";
import { articlePartsSchema, flattenArticleParts } from "@/lib/materials/article-parts";
import type { z } from "zod";
import type { codingSurfaceSchema } from "./http-contracts";
import type { CodingProblemPrivate } from "./contracts";
import { resolveLiveCodingSurface } from "./live-server";

export async function resolveCodingSurface(surface: z.infer<typeof codingSurfaceSchema>, problem: CodingProblemPrivate, userId: string) {
  if (surface.kind === "live_quiz") return resolveLiveCodingSurface(surface, problem, userId);
  const rows = await db.select({ content: blokArtikel.content }).from(blokArtikel).innerJoin(artikel, eq(blokArtikel.artikelId, artikel.id)).where(and(eq(artikel.id, surface.articleId), eq(artikel.version, surface.articleVersion), eq(artikel.mataKuliahId, problem.courseId), eq(artikel.status, "published"), eq(blokArtikel.version, surface.articleVersion), eq(blokArtikel.status, "published")));
  const found = rows.some((row) => {
    const match = row.content.match(/<!--__ZYX_V[34]_BLOCK_PAYLOAD__:([A-Za-z0-9_-]+)-->/);
    if (!match) return false;
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      const parsed = articlePartsSchema.safeParse(payload.parts);
      return parsed.success && flattenArticleParts(parsed.data).some((part) => part.id === surface.partId && part.kind === "coding_exercise" && part.problem.problemId === problem.problemId && part.problem.version === problem.version);
    } catch { return false; }
  });
  if (!found) throw new Error("CODING_INVALID_SURFACE");
  return { surfaceId: `article:${surface.articleId}:${surface.articleVersion}:${surface.partId}`, maxAttempts: null, deadlineMs: null, assistance: "full" as const };
}
