import 'server-only';
import { and, desc, eq, or, exists, sql } from 'drizzle-orm';
import { db } from '@/db';
import { artikel, bagianArtikel, bab, flashcard, gamificationChecklists, gamificationChecklistItems, gamificationCourseStarts, mataKuliah, setFlashcard, soal, solutionCollections } from '@/db/schema';
import { assertAuthoringActor } from '@/lib/auth/authoring-actor';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { solutionCollectionSchema } from '@/lib/materials/solution-collection';
import { allocateChecklistXp, courseCreditMicro } from './policy';
import type { ChecklistCategory } from './contracts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Item = { category: ChecklistCategory; sourceId: string; contentVersion: string };
const categories: ChecklistCategory[] = ['article', 'explanation', 'question', 'flashcard'];
export function prepareChecklistItems(items: Item[]) {
 const identities = new Set<string>();
 for (const item of items) {
  if (!categories.includes(item.category) || !item.sourceId || !item.contentVersion || identities.has(`${item.category}:${item.sourceId}`)) throw new Error('INVALID_CHECKLIST_ITEMS');
  identities.add(`${item.category}:${item.sourceId}`);
 }
 return categories.flatMap(category => {
  const group = items.filter(item => item.category === category);
  if (!group.length) throw new Error('EMPTY_CHECKLIST_CATEGORY');
  const allocation = allocateChecklistXp(category, group.map(item => item.sourceId));
  return group.map(item => ({ ...item, baseXpMicro: allocation.get(item.sourceId)! }));
 });
}
async function canonicalCourse(tx: Transaction, courseId: string, lock = true) {
 const query = tx.select().from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)));
 const rows = await (lock ? query.for('update') : query);
 if (rows.length !== 1 || rows[0].status !== 'active' || rows[0].isDemo) throw new Error('COURSE_UNAVAILABLE_OR_AMBIGUOUS');
 // Check the reverse mapping as well when called with a canonical ID.
 if (rows[0].legacyCourseId) {
  const mapped = await tx.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.legacyCourseId, rows[0].legacyCourseId));
  if (mapped.length !== 1) throw new Error('COURSE_UNAVAILABLE_OR_AMBIGUOUS');
 }
 return rows[0];
}
// New approvals exclude essay and short-answer questions because their rewards cannot be verified. Frozen approvals remain unchanged.
async function sourceItems(tx: Transaction, courseId: string): Promise<Item[]> {
 // SHARE table locks also block inserts and publication of previously ineligible rows.
 // All locks are acquired in a fixed order; normal INSERT, UPDATE and DELETE conflict.
 await tx.execute(sql`LOCK TABLE artikel, bab, bagian_artikel, flashcard, set_flashcard, soal, solution_collections IN SHARE MODE`);
 const [articles, explanations, questions, cards] = await Promise.all([
  tx.select({ id: artikel.id, version: artikel.version }).from(artikel).where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, 'published'), eq(artikel.structureStatus, 'structured'), exists(tx.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(eq(bagianArtikel.artikelId, artikel.id), eq(bagianArtikel.version, artikel.version), eq(bagianArtikel.status, 'published')))))),
  tx.select({ id: solutionCollections.productId, version: solutionCollections.version, content: solutionCollections.content }).from(solutionCollections).innerJoin(bab, eq(bab.id, solutionCollections.chapterId)).where(and(eq(solutionCollections.courseId, courseId), eq(solutionCollections.status, 'published'), eq(bab.status, 'active'), eq(bab.mataKuliahId, courseId))),
  tx.select({ id: soal.id, version: soal.version }).from(soal).where(and(eq(soal.mataKuliahId, courseId), eq(soal.status, 'published'), eq(soal.quizEligible, true), or(eq(soal.questionType, 'multiple_choice'), eq(soal.questionType, 'multiple_choices')))),
  tx.select({ id: flashcard.id, version: flashcard.version }).from(flashcard).innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id)).where(and(eq(setFlashcard.mataKuliahId, courseId), eq(setFlashcard.status, 'published'), eq(flashcard.status, 'published'))),
 ]);
 const rows = [
  ...articles.map(x => ({ ...x, category: 'article' as const })),
  ...explanations.filter(x => { const parsed = solutionCollectionSchema.safeParse(x.content); return parsed.success && parsed.data.id === x.id && parsed.data.items.length > 0 && parsed.data.items.every(item => item.visuals.every(visual => visual.kind !== 'source_figure')); }).map(x => ({ ...x, category: 'explanation' as const })),
  ...questions.map(x => ({ ...x, category: 'question' as const })),
  ...cards.map(x => ({ ...x, category: 'flashcard' as const })),
 ];
 return rows.map(x => ({ category: x.category, sourceId: x.id, contentVersion: String(x.version) }));
}
function signature(items: { category: string; sourceId: string; contentVersion: string; baseXpMicro: number }[]) {
 return JSON.stringify(items.map(i => [i.category, i.sourceId, i.contentVersion, i.baseXpMicro]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export async function createOrRefreshGamificationChecklist(adminId: string, canonicalCourseId: string) {
 return db.transaction(async tx => {
  await assertAuthoringActor(tx, adminId, { roles: ['admin'], error: 'FORBIDDEN', lock: true });
  const course = await canonicalCourse(tx, canonicalCourseId);
  const items = prepareChecklistItems(await sourceItems(tx, course.id));
  const existing = await tx.select().from(gamificationChecklists).where(eq(gamificationChecklists.courseId, course.id)).orderBy(desc(gamificationChecklists.version));
  const draft = existing.find(x => x.status === 'draft');
  const totalXpMicro = items.reduce((sum, i) => sum + i.baseXpMicro, 0);
  const id = draft?.id ?? crypto.randomUUID();
  if (draft) {
   await tx.delete(gamificationChecklistItems).where(eq(gamificationChecklistItems.checklistId, id));
   await tx.update(gamificationChecklists).set({ totalXpMicro }).where(eq(gamificationChecklists.id, id));
  } else await tx.insert(gamificationChecklists).values({ id, courseId: course.id, version: (existing[0]?.version ?? 0) + 1, totalXpMicro });
  await tx.insert(gamificationChecklistItems).values(items.map(item => ({ ...item, id: crypto.randomUUID(), checklistId: id })));
  return { id, courseId: course.id, totalXpMicro, courseCreditMicro: courseCreditMicro(totalXpMicro), items };
 });
}
export async function approveGamificationChecklist(adminId: string, checklistId: string) {
 return db.transaction(async tx => {
  await assertAuthoringActor(tx, adminId, { roles: ['admin'], error: 'FORBIDDEN', lock: true });
  const [initial] = await tx.select().from(gamificationChecklists).where(eq(gamificationChecklists.id, checklistId)).limit(1);
  if (!initial) throw new Error('CHECKLIST_NOT_FOUND');
  await canonicalCourse(tx, initial.courseId);
  const [checklist] = await tx.select().from(gamificationChecklists).where(eq(gamificationChecklists.id, checklistId)).for('update');
  if (checklist.status !== 'draft') throw new Error('CHECKLIST_NOT_DRAFT');
  const stored = await tx.select().from(gamificationChecklistItems).where(eq(gamificationChecklistItems.checklistId, checklistId));
  const current = prepareChecklistItems(await sourceItems(tx, checklist.courseId));
  if (signature(stored) !== signature(current) || checklist.totalXpMicro !== current.reduce((sum, i) => sum + i.baseXpMicro, 0)) throw new Error('CHECKLIST_STALE');
  const [approved] = await tx.update(gamificationChecklists).set({ status: 'approved', approvedBy: adminId, approvedAt: new Date() }).where(eq(gamificationChecklists.id, checklistId)).returning();
  return approved;
 });
}
export async function ensureGamificationCourseStart(tx: Transaction, userId: string, courseId: string, occurredAt: Date = new Date()) {
 if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) throw new Error('INVALID_START_TIME');
 const access = await resolveCourseAccess({ userId, courseId }, tx);
 if (!access.isAuthenticated || !access.isEnrolled || !access.hasFullContentAccess || !access.canonicalCourseId || access.isDemo) throw new Error('COURSE_ACCESS_REQUIRED');
 const course = await canonicalCourse(tx, access.canonicalCourseId, false);
 const [started] = await tx.select().from(gamificationCourseStarts).where(and(eq(gamificationCourseStarts.userId, userId), eq(gamificationCourseStarts.courseId, course.id))).limit(1);
 if (started) return started;
 const [checklist] = await tx.select().from(gamificationChecklists).where(and(eq(gamificationChecklists.courseId, course.id), eq(gamificationChecklists.status, 'approved'))).orderBy(desc(gamificationChecklists.version)).limit(1);
 if (!checklist) return null;
 const [result] = await tx.insert(gamificationCourseStarts).values({ userId, courseId: course.id, checklistId: checklist.id, startedAt: occurredAt }).onConflictDoNothing().returning();
 if (result) return result;
 const [concurrent] = await tx.select().from(gamificationCourseStarts).where(and(eq(gamificationCourseStarts.userId, userId), eq(gamificationCourseStarts.courseId, course.id)));
 return concurrent;
}
export async function getGamificationCourseChecklist(userId: string, courseId: string) {
 const access = await resolveCourseAccess({ userId, courseId });
 if (!access.isAuthenticated || !access.isEnrolled || !access.hasFullContentAccess || !access.canonicalCourseId || access.isDemo) throw new Error('COURSE_ACCESS_REQUIRED');
 const [start] = await db.select().from(gamificationCourseStarts).where(and(eq(gamificationCourseStarts.userId, userId), eq(gamificationCourseStarts.courseId, access.canonicalCourseId))).limit(1);
 if (!start) return null;
 const [checklist] = await db.select().from(gamificationChecklists).where(eq(gamificationChecklists.id, start.checklistId));
 const items = await db.select().from(gamificationChecklistItems).where(eq(gamificationChecklistItems.checklistId, start.checklistId));
 return { start, checklist, items, courseCreditMicro: courseCreditMicro(checklist.totalXpMicro) };
}
export async function listGamificationAdminChecklists(adminId: string) {
 await assertAuthoringActor(db, adminId, { roles: ['admin'], error: 'FORBIDDEN' });
 return db.select().from(gamificationChecklists).orderBy(desc(gamificationChecklists.version));
}
