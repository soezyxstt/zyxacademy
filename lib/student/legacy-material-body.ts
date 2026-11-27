import { and, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import { aiMaterialInstances, websiteMaterials } from "@/db/schema";

/** Read the learner-visible body only for the chapters the caller has authorized. */
export async function readLegacyMaterialBody(courseId: string, materialId: string, format: "website" | "generated", chapterIds: readonly string[]) {
  if (!chapterIds.length) return null;
  if (format === "website") {
    const [row] = await db.select({ body: websiteMaterials.canonicalMarkdown }).from(websiteMaterials).where(and(
      eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, courseId),
      eq(websiteMaterials.status, "published"), eq(websiteMaterials.chapterId, chapterIds[0]),
    )).limit(1);
    return row?.body ?? null;
  }
  const row = await db.query.aiMaterialInstances.findFirst({
    columns: { chapterIds: true },
    where: and(eq(aiMaterialInstances.id, materialId), eq(aiMaterialInstances.courseId, courseId), notLike(aiMaterialInstances.title, "[DRAF]%")),
    with: { sections: { columns: { title: true }, orderBy: (section, { asc }) => [asc(section.orderIndex), asc(section.id)],
      with: { chunks: { columns: { chunkText: true }, orderBy: (chunk, { asc }) => [asc(chunk.orderIndex), asc(chunk.id)] } } } },
  });
  if (!row || JSON.stringify(row.chapterIds) !== JSON.stringify(chapterIds)) return null;
  return row.sections.map(section => (section.title ? "## " + section.title + "\n\n" : "") + section.chunks.map(chunk => chunk.chunkText).join("\n\n")).join("\n\n");
}
