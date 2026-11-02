import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, asc, count, eq, getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { courses, chapters, courseMaterials, courseVideos, courseVideoPlaylists, mataKuliah, bab, sumberMateri } from "@/db/schema";
import { saveCourseWithCanonicalProjection, saveChapterWithCanonicalProjection, archiveCourseWithLegacyDeletion, archiveChapterWithLegacyDeletion, reorderChaptersWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminToolkit, adminId, adminRevision, adminPagination } from "./toolkit";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";

type Source = AdminTransaction | typeof db;
async function course(id: string, source: Source = db) {
  const [row] = await source.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!row) throw new AdminMcpError("NOT_FOUND");
  return row;
}
async function chapter(id: string, source: Source = db) {
  const [row] = await source.select().from(chapters).where(eq(chapters.id, id)).limit(1);
  if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
}
const courseView = (row: typeof courses.$inferSelect) => ({ id: row.id, title: row.title, category: row.category, description: row.description, revision: revisionOf(row) });
const chapterView = (row: typeof chapters.$inferSelect) => ({ id: row.id, courseId: row.courseId, title: row.title, description: row.description, orderIndex: row.orderIndex, status: row.status, revision: revisionOf(row) });
function expectRevision(row: unknown, expected: string) { if (revisionOf(row) !== expected) throw new AdminMcpError("REVISION_CONFLICT"); }
/** Discover references from trusted schema metadata, never caller-supplied SQL or table names. */
async function dependencies(target: PgTable, id: string, source: Source = db) {
  const counts: Record<string, number> = {};
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable) || (target === courses && table === mataKuliah) || (target === chapters && table === bab)) continue;
    for (const fk of getTableConfig(table).foreignKeys) {
      const ref = fk.reference();
      if (ref.foreignTable !== target) continue;
      const [result] = await source.select({ count: count() }).from(table).where(eq(ref.columns[0], id));
      if (result.count) counts[`${getTableName(table)}.${ref.columns[0].name}`] = result.count;
    }
  }
  return counts;
}
const courseDefinition = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/), title: z.string().trim().min(1).max(500), category: z.enum(allowedCategories), description: z.string().max(20000).nullable().default(null) }).strict();
const chapterDefinition = z.object({ title: z.string().trim().min(1).max(500), description: z.string().max(20000).nullable().default(null), orderIndex: z.number().int().min(1).max(100000) }).strict();
const videoDefinition = z.object({ courseId: adminId, playlistId: adminId, chapterId: adminId.nullable().default(null), title: z.string().trim().min(1).max(500), description: z.string().max(20000).nullable().default(null), videoUrl: z.url().max(2048).refine(v => new URL(v).protocol === "https:"), duration: z.number().int().nonnegative().nullable().default(null), orderIndex: z.number().int().nonnegative().default(0) }).strict();
export function registerAcademicTools(server: McpServer, principal: McpPrincipal) {
  const { read, write } = adminToolkit(server, principal);
  read("courses.get", "courses:read", z.object({ id: adminId }), "Lihat mata kuliah dan revisinya.", async ({ id }) => courseView(await course(id)));
  write("courses.create", "courses:write", courseDefinition, "Buat mata kuliah beserta proyeksi canonical.", async (tx, input) => {
    const existing = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.id)).limit(1);
    if (existing.length) throw new AdminMcpError("ALREADY_EXISTS");
    await saveCourseWithCanonicalProjection({ ...input, actorId: principal.actorId, isNew: true }, tx);
    return courseView(await course(input.id, tx));
  });
  write("courses.update", "courses:write", courseDefinition.extend({ expectedRevision: adminRevision }), "Ubah metadata mata kuliah dan proyeksi canonical.", async (tx, { expectedRevision, ...input }) => {
    expectRevision(await course(input.id, tx), expectedRevision);
    await saveCourseWithCanonicalProjection({ ...input, actorId: principal.actorId, isNew: false }, tx);
    return courseView(await course(input.id, tx));
  });
  write("courses.archive", "courses:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Arsipkan mata kuliah kosong. Referensi materi atau aktivitas harus diselesaikan lebih dahulu.", async (tx, input) => {
    expectRevision(await course(input.id, tx), input.expectedRevision);
    const impact = await dependencies(courses, input.id, tx);
    if (Object.keys(impact).length) throw new AdminMcpError("DEPENDENCIES_EXIST");
    await archiveCourseWithLegacyDeletion(input.id, principal.actorId, tx); return { id: input.id, archived: true };
  }, async input => ({ id: input.id, references: await dependencies(courses, input.id), revision: courseView(await course(input.id)).revision }));
  read("chapters.get", "chapters:read", z.object({ id: adminId }), "Lihat bab dan revisinya.", async ({ id }) => chapterView(await chapter(id)));
  write("chapters.create", "chapters:write", chapterDefinition.extend({ courseId: adminId }), "Buat bab beserta proyeksi canonical.", async (tx, input) => {
    await course(input.courseId, tx);
    const result = await saveChapterWithCanonicalProjection({ ...input, actorId: principal.actorId }, tx);
    return chapterView(await chapter(result.id, tx));
  });
  write("chapters.update", "chapters:write", chapterDefinition.extend({ id: adminId, expectedRevision: adminRevision }), "Ubah bab tanpa memindahkan mata kuliah.", async (tx, { expectedRevision, ...input }) => {
    const existing = await chapter(input.id, tx); expectRevision(existing, expectedRevision);
    await saveChapterWithCanonicalProjection({ ...input, courseId: existing.courseId, actorId: principal.actorId }, tx);
    return chapterView(await chapter(input.id, tx));
  });
  write("chapters.archive", "chapters:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Arsipkan bab kosong. Materi dan aktivitas terhubung tidak dihapus otomatis.", async (tx, input) => {
    expectRevision(await chapter(input.id, tx), input.expectedRevision);
    const impact = await dependencies(chapters, input.id, tx);
    const linkedMaterials = await tx.select({ chapterIds: courseMaterials.chapterIds }).from(courseMaterials).where(eq(courseMaterials.courseId, (await chapter(input.id, tx)).courseId));
    if (Object.keys(impact).length || linkedMaterials.some(m => m.chapterIds.includes(input.id))) throw new AdminMcpError("DEPENDENCIES_EXIST");
    await archiveChapterWithLegacyDeletion(input.id, principal.actorId, tx); return { id: input.id, archived: true };
  }, async input => ({ id: input.id, references: await dependencies(chapters, input.id) }));
  read("chapters.order", "chapters:read", z.object({ courseId: adminId }), "Lihat urutan bab dan revisi koleksi untuk pengurutan.", async ({ courseId }) => {
    const rows = await db.select().from(chapters).where(eq(chapters.courseId, courseId)).orderBy(asc(chapters.id)).limit(1001);
    if (rows.length > 1000) throw new AdminMcpError("TOO_MANY_CHAPTERS");
    return { courseId, chapters: rows.map(chapterView), revision: revisionOf(rows) };
  });
  write("chapters.reorder", "chapters:write", z.object({ courseId: adminId, chapterIds: z.array(adminId).min(1).max(1000), expectedRevision: adminRevision }), "Atur ulang seluruh bab dalam satu mata kuliah.", async (tx, input) => {
    const rows = await tx.select().from(chapters).where(eq(chapters.courseId, input.courseId)).orderBy(asc(chapters.id)); expectRevision(rows, input.expectedRevision);
    if (rows.length !== input.chapterIds.length || new Set(input.chapterIds).size !== rows.length || rows.some(row => !input.chapterIds.includes(row.id))) throw new AdminMcpError("INVALID_CHAPTER_SET");
    await reorderChaptersWithCanonicalProjection(input.courseId, input.chapterIds, principal.actorId, tx); return { id: input.courseId, chapterIds: input.chapterIds };
  });
  async function video(id: string, source: Source = db) {
    const [row] = await source.select().from(courseVideos).where(eq(courseVideos.id, id)).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
  }
  const videoView = (row: typeof courseVideos.$inferSelect) => ({ id: row.id, courseId: row.courseId, playlistId: row.playlistId, chapterId: row.chapterId, title: row.title, description: row.description, duration: row.duration, orderIndex: row.orderIndex, revision: revisionOf(row) });
  async function validateVideo(tx: AdminTransaction, input: z.infer<typeof videoDefinition>) {
    const [playlist] = await tx.select().from(courseVideoPlaylists).where(and(eq(courseVideoPlaylists.id, input.playlistId), eq(courseVideoPlaylists.courseId, input.courseId))).limit(1);
    if (!playlist) throw new AdminMcpError("PLAYLIST_COURSE_MISMATCH");
    if (input.chapterId && (await chapter(input.chapterId, tx)).courseId !== input.courseId) throw new AdminMcpError("CHAPTER_COURSE_MISMATCH");
  }
  read("videos.get", "videos:read", z.object({ id: adminId }), "Lihat metadata video tanpa URL penyimpanan.", async ({ id }) => videoView(await video(id)));
  read("videos.playlists.list", "videos:read", z.object({ courseId: adminId, ...adminPagination }), "Daftar playlist video.", async ({ courseId, limit, offset }) => (await db.select().from(courseVideoPlaylists).where(eq(courseVideoPlaylists.courseId, courseId)).orderBy(asc(courseVideoPlaylists.id)).limit(limit).offset(offset)).map(row => ({ ...row, revision: revisionOf(row) })));
  write("videos.playlists.create", "videos:write", z.object({ courseId: adminId, title: z.string().trim().min(1).max(500), description: z.string().max(10000).nullable().default(null), orderIndex: z.number().int().nonnegative().default(0) }), "Buat playlist video.", async (tx, input) => {
    await course(input.courseId, tx); const [row] = await tx.insert(courseVideoPlaylists).values({ ...input, id: crypto.randomUUID() }).returning(); return { ...row, revision: revisionOf(row) };
  });
  write("videos.create", "videos:write", videoDefinition, "Tambahkan video HTTPS ke playlist dalam mata kuliah yang sama.", async (tx, input) => {
    await validateVideo(tx, input); const [row] = await tx.insert(courseVideos).values({ ...input, id: crypto.randomUUID(), uploadedBy: principal.userId }).returning(); return videoView(row);
  });
  write("videos.update", "videos:write", videoDefinition.extend({ id: adminId, expectedRevision: adminRevision }), "Ubah metadata dan tautan video dengan validasi playlist dan bab.", async (tx, { id, expectedRevision, ...input }) => {
    const old = await video(id, tx); expectRevision(old, expectedRevision);
    if (old.courseId !== input.courseId) throw new AdminMcpError("COURSE_MOVE_FORBIDDEN");
    await validateVideo(tx, input); const [row] = await tx.update(courseVideos).set(input).where(eq(courseVideos.id, id)).returning(); return videoView(row);
  });
  write("videos.delete", "videos:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Hapus entri video. Objek penyimpanan tetap tersedia.", async (tx, input) => {
    expectRevision(await video(input.id, tx), input.expectedRevision); await tx.delete(courseVideos).where(eq(courseVideos.id, input.id)); return { id: input.id, deleted: true };
  });
  async function material(id: string, source: Source = db) {
    const [row] = await source.select().from(courseMaterials).where(eq(courseMaterials.id, id)).limit(1); if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
  }
  const materialView = (row: typeof courseMaterials.$inferSelect) => ({ id: row.id, courseId: row.courseId, title: row.title, type: row.type, subcategory: row.subcategory, year: row.year, chapterIds: row.chapterIds, revision: revisionOf(row) });
  read("materials.get", "materials:read", z.object({ id: adminId }), "Lihat metadata materi dan revisinya tanpa URL penyimpanan.", async ({ id }) => materialView(await material(id)));
  write("materials.update_metadata", "materials:write", z.object({ id: adminId, expectedRevision: adminRevision, title: z.string().trim().min(1).max(500), type: z.enum(["materi", "soal", "pembahasan_soal", "materi_kelas", "contoh_soal"]).optional(), subcategory: z.enum(["materi_dosen", "scl", "modul", "ebook", "kuis", "kbf", "tutorial", "uts", "uas", "up", "ltm", "lainnya"]).nullable().optional(), year: z.number().int().min(1900).max(2100).nullable(), chapterIds: z.array(adminId).min(1).max(200) }), "Ubah judul, tahun, dan pengaitan bab tanpa mengubah sumber atau provenance.", async (tx, { id, expectedRevision, ...input }) => {
    const old = await material(id, tx); expectRevision(old, expectedRevision);
    if (new Set(input.chapterIds).size !== input.chapterIds.length) throw new AdminMcpError("DUPLICATE_CHAPTER");
    for (const chapterId of input.chapterIds) if ((await chapter(chapterId, tx)).courseId !== old.courseId) throw new AdminMcpError("CHAPTER_COURSE_MISMATCH");
    const [row] = await tx.update(courseMaterials).set(input).where(eq(courseMaterials.id, id)).returning();
    await tx.update(sumberMateri).set({ title: input.title, updatedAt: new Date() }).where(eq(sumberMateri.id, `sm-legacy-${id}`));
    return materialView(row);
  });
}
