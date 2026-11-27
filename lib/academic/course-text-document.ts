import { and, eq, inArray, or } from "drizzle-orm";
import type { db } from "@/db";
import { artikel, diktatMateri, websiteMaterials } from "@/db/schema";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { textDocumentSources, type TextDocumentDraft, type TextDocumentSource } from "@/packages/native-parity/academic/courses/text-document";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TextDocumentChange = Omit<Extract<TextDocumentDraft, { action: "content" }>, "source" | "expectedRevision"> |
  Omit<Extract<TextDocumentDraft, { action: "status" }>, "source" | "expectedRevision">;

export function isTextDocumentSource(value: string): value is TextDocumentSource {
  return textDocumentSources.some(source => source === value);
}

/** Both native and web use these projections and enqueue the offline change in the same transaction. */
export async function writeCourseTextDocument(tx: Tx,
  target: { source: TextDocumentSource; id: string; courseIds?: readonly string[]; allowArticleSlug?: boolean },
  change: TextDocumentChange) {
  const { id, source, courseIds, allowArticleSlug } = target;
  const now = new Date();
  const canonicalFields = change.action === "status"
    ? { status: change.status, publishedAt: change.status === "published" ? now : null, updatedAt: now }
    : { title: change.title, contentMarkdown: change.markdown, babId: change.chapterId, updatedAt: now };
  const offlineAction = change.action === "status" && change.status === "draft" ? "delete" : "upsert";
  if (source === "canonical-article") {
    const rows = await tx.update(artikel).set(canonicalFields)
      .where(and(allowArticleSlug ? or(eq(artikel.id, id), eq(artikel.slug, id)) : eq(artikel.id, id),
        courseIds ? inArray(artikel.mataKuliahId, courseIds) : undefined))
      .returning({ id: artikel.id, courseId: artikel.mataKuliahId });
    for (const row of rows) await recordOfflineChange(tx, { kind: "article", resourceId: row.id, courseId: row.courseId, action: offlineAction });
    return rows;
  }
  if (source === "canonical-diktat") {
    const rows = await tx.update(diktatMateri).set(canonicalFields)
      .where(and(eq(diktatMateri.id, id), courseIds ? inArray(diktatMateri.mataKuliahId, courseIds) : undefined))
      .returning({ id: diktatMateri.id, courseId: diktatMateri.mataKuliahId });
    for (const row of rows) await recordOfflineChange(tx, { kind: "diktat", resourceId: row.id, courseId: row.courseId, action: offlineAction });
    return rows;
  }
  const fields = change.action === "status" ? { status: change.status }
    : { title: change.title, canonicalMarkdown: change.markdown, chapterId: change.chapterId ?? "" };
  const rows = await tx.update(websiteMaterials).set(fields)
    .where(and(eq(websiteMaterials.id, id), courseIds ? inArray(websiteMaterials.courseId, courseIds) : undefined))
    .returning({ id: websiteMaterials.id, courseId: websiteMaterials.courseId });
  for (const row of rows) await recordOfflineChange(tx, { kind: "course", courseId: row.courseId, action: "invalidate" });
  return rows;
}
