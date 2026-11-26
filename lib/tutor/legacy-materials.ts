import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { aiMaterialInstances, aiMaterialInstanceChunks, aiMaterialInstanceSections, mataKuliah } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { parseMaterialIntoSections } from "@/lib/ingestion-parser";
import { reconstructLegacyMaterialMarkdown, type LegacyMaterialSection, type TutorLegacyMaterialCommand } from "@/packages/academic/tutor-legacy-materials";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MaterialText = Pick<Extract<TutorLegacyMaterialCommand, { action: "create" }>, "title" | "summary" | "markdown">;
type Change = MaterialText & { action: "create" | "edit"; id?: string; expectedRevision?: string }
  | { action: "delete"; id: string; expectedRevision?: string };
type Material = Pick<typeof aiMaterialInstances.$inferSelect, "id" | "courseId" | "title" | "summary">;

export function legacyMaterialRevision(material: Material, sections: LegacyMaterialSection[]) {
  return revisionOf({ id: material.id, courseId: material.courseId, title: material.title, summary: material.summary,
    sections: sections.map(section => ({ title: section.title, orderIndex: section.orderIndex,
      chunks: section.chunks.map(({ chunkText, orderIndex }) => ({ chunkText, orderIndex })) })),
  });
}

export async function lockLegacyMaterialCourse(tx: Tx, actorId: string, courseId: string) {
  let access;
  try { access = await requireTutorCourseAccess(actorId, courseId, { allowAdmin: true }, tx); }
  catch { throw new Error("FORBIDDEN"); }
  if (access.source !== "admin_override") throw new Error("FORBIDDEN");
  if (!access.courseId || !access.legacyCourseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");
  const mapped = await tx.select({ id: mataKuliah.id }).from(mataKuliah)
    .where(and(eq(mataKuliah.legacyCourseId, access.legacyCourseId), eq(mataKuliah.status, "active"))).for("share");
  if (mapped.length !== 1 || mapped[0].id !== access.courseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");
  return access.legacyCourseId;
}

async function materialSections(tx: Tx, id: string) {
  const sections = await tx.select().from(aiMaterialInstanceSections).where(eq(aiMaterialInstanceSections.materialInstanceId, id))
    .orderBy(asc(aiMaterialInstanceSections.orderIndex), asc(aiMaterialInstanceSections.id));
  const ids = sections.map(section => section.id);
  const chunks = ids.length ? await tx.select().from(aiMaterialInstanceChunks).where(inArray(aiMaterialInstanceChunks.sectionId, ids))
    .orderBy(asc(aiMaterialInstanceChunks.orderIndex), asc(aiMaterialInstanceChunks.id)) : [];
  const bySection = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const list = bySection.get(chunk.sectionId) ?? [];
    list.push(chunk);
    bySection.set(chunk.sectionId, list);
  }
  return sections.map(section => ({ title: section.title, orderIndex: section.orderIndex, chunks: bySection.get(section.id) ?? [] }));
}

async function requireMaterial(tx: Tx, legacyId: string, id: string, lock: "share" | "update") {
  const [material] = await tx.select().from(aiMaterialInstances).where(and(
    eq(aiMaterialInstances.id, id), eq(aiMaterialInstances.courseId, legacyId),
  )).limit(1).for(lock);
  if (!material) throw new Error("NOT_FOUND");
  return material;
}

export async function readLegacyMaterialDraft(tx: Tx, legacyId: string, id: string) {
  const material = await requireMaterial(tx, legacyId, id, "share");
  const sections = await materialSections(tx, id);
  return { id, courseId: material.courseId, title: material.title, summary: material.summary,
    revision: legacyMaterialRevision(material, sections), markdown: reconstructLegacyMaterialMarkdown(sections) };
}

export async function writeLegacyMaterial(tx: Tx, legacyId: string, command: Change) {
  const id = command.action === "create" ? `mat-tutor-${randomUUID()}` : command.id;
  if (!id) throw new Error("INVALID_INPUT");
  if (command.action !== "create") {
    const material = await requireMaterial(tx, legacyId, id, "update");
    if (command.expectedRevision && legacyMaterialRevision(material, await materialSections(tx, id)) !== command.expectedRevision) {
      throw new Error("REVISION_CONFLICT");
    }
    if (command.action === "delete") {
      await tx.delete(aiMaterialInstances).where(and(eq(aiMaterialInstances.id, id), eq(aiMaterialInstances.courseId, legacyId)));
      return id;
    }
  }
  const { title, summary, markdown } = command;
  if ([title, summary, markdown].some(text => !text.trim() || text.includes("\0"))) throw new Error("INVALID_INPUT");
  const sections = parseMaterialIntoSections(markdown);
  if (command.action === "create") {
    await tx.insert(aiMaterialInstances).values({ id, courseId: legacyId, title, summary, sourceType: "markdown",
      learningObjectives: [], keywords: [], pineconeSyncStatus: "pending" });
  } else {
    await tx.update(aiMaterialInstances).set({ title, summary, updatedAt: new Date() })
      .where(and(eq(aiMaterialInstances.id, id), eq(aiMaterialInstances.courseId, legacyId)));
    await tx.delete(aiMaterialInstanceSections).where(eq(aiMaterialInstanceSections.materialInstanceId, id));
  }
  for (const section of sections) {
    const sectionId = `sec-tutor-${randomUUID()}`;
    await tx.insert(aiMaterialInstanceSections).values({ id: sectionId, materialInstanceId: id, title: section.title, orderIndex: section.orderIndex });
    if (section.chunks.length) await tx.insert(aiMaterialInstanceChunks).values(section.chunks.map(chunk => {
      const chunkId = `chk-tutor-${randomUUID()}`;
      return { id: chunkId, sectionId, chunkText: chunk.chunkText, orderIndex: chunk.orderIndex, pineconeVectorId: `vec-tutor-${chunkId}`, isSynced: false };
    }));
  }
  return id;
}
