import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { artikel, diktatMateri } from "@/db/schema";

export async function findCanonicalDetail(courseId: string, materialId: string) {
  const [articles, handbooks] = await Promise.all([
    db.select({ id: artikel.id, title: artikel.title, chapterId: artikel.babId, version: artikel.version, updatedAt: artikel.updatedAt })
      .from(artikel)
      .where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, "published"), or(eq(artikel.id, materialId), eq(artikel.slug, materialId))))
      .limit(2),
    db.select({ id: diktatMateri.id, title: diktatMateri.title, chapterId: diktatMateri.babId, fileKey: diktatMateri.fileKey, version: diktatMateri.version, updatedAt: diktatMateri.updatedAt })
      .from(diktatMateri)
      .where(and(eq(diktatMateri.mataKuliahId, courseId), eq(diktatMateri.status, "published"), eq(diktatMateri.id, materialId)))
      .limit(1),
  ]);
  // Reuse canonical article precedence and reject an ambiguous id or slug.
  if (articles.length > 1) return { ambiguous: true } as const;
  if (articles[0]) return { ...articles[0], group: "materi", policyKind: "article" } as const;
  if (handbooks[0]) return { ...handbooks[0], group: "diktat", policyKind: "diktat" } as const;
  return null;
}
