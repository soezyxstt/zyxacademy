import 'server-only';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { auditMutasi, gamificationChecklists, gamificationChecklistItems, gamificationCosmetics, gamificationInventory, gamificationProfiles, gamificationReports, mataKuliah } from '@/db/schema';
import { assertAuthoringActor } from '@/lib/auth/authoring-actor';
import { courseCreditMicro } from './policy';
import { COSMETIC_CATALOG } from './catalog';

const pageNumber = (value: unknown) => typeof value === 'string' && /^\d{1,4}$/.test(value) ? Math.max(1, Math.min(1000, Number(value))) : 1;
export async function getAdminGamificationData(adminId: string, input: { q?: string; page?: string; course?: string; reports?: string; reportPage?: string }) {
 await assertAuthoringActor(db, adminId, { roles: ['admin'], error: 'FORBIDDEN' });
 const q = (input.q ?? '').slice(0, 100).trim();
 const page = pageNumber(input.page), reportPage = pageNumber(input.reportPage);
 const status = input.reports === 'resolved' ? 'resolved' : input.reports === 'dismissed' ? 'dismissed' : 'pending';
 const courses = await db.select({ id: mataKuliah.id, title: mataKuliah.title, code: mataKuliah.code }).from(mataKuliah).where(and(eq(mataKuliah.status, 'active'), eq(mataKuliah.isDemo, false), q ? or(ilike(mataKuliah.title, `%${q.replace(/[%_\\]/g, '\\$&')}%`), ilike(mataKuliah.code, `%${q.replace(/[%_\\]/g, '\\$&')}%`)) : undefined)).orderBy(asc(mataKuliah.title), asc(mataKuliah.id)).limit(21).offset((page - 1) * 20);
 const selected = input.course && input.course.length <= 200 ? await db.select({ id: mataKuliah.id, title: mataKuliah.title }).from(mataKuliah).where(and(eq(mataKuliah.id, input.course), eq(mataKuliah.status, 'active'), eq(mataKuliah.isDemo, false))).limit(1) : [];
 const checklists = selected[0] ? await db.select().from(gamificationChecklists).where(eq(gamificationChecklists.courseId, selected[0].id)).orderBy(desc(gamificationChecklists.version)).limit(50) : [];
 const ids = checklists.map(x => x.id);
 const counts = ids.length ? await db.select({ checklistId: gamificationChecklistItems.checklistId, category: gamificationChecklistItems.category, count: sql<number>`count(*)::int` }).from(gamificationChecklistItems).where(sql`${gamificationChecklistItems.checklistId} in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`).groupBy(gamificationChecklistItems.checklistId, gamificationChecklistItems.category) : [];
 // Only a small preview of the newest version, never content bodies.
 const preview = ids.length ? await db.select({ category: gamificationChecklistItems.category, sourceId: gamificationChecklistItems.sourceId, contentVersion: gamificationChecklistItems.contentVersion }).from(gamificationChecklistItems).where(eq(gamificationChecklistItems.checklistId, ids[0])).orderBy(asc(gamificationChecklistItems.category), asc(gamificationChecklistItems.sourceId)).limit(20) : [];
 const reports = await db.select({ id: gamificationReports.id, reason: gamificationReports.reason, status: gamificationReports.status, publicId: gamificationProfiles.publicId, displayName: gamificationProfiles.displayName }).from(gamificationReports).leftJoin(gamificationProfiles, eq(gamificationProfiles.userId, gamificationReports.targetUserId)).where(eq(gamificationReports.status, status)).orderBy(desc(gamificationReports.createdAt), desc(gamificationReports.id)).limit(51).offset((reportPage - 1) * 50);
 const cosmetics = await db.select({ id: gamificationCosmetics.id, name: gamificationCosmetics.name, priceLp: gamificationCosmetics.priceLp, active: gamificationCosmetics.active, inventory: sql<number>`count(${gamificationInventory.userId})::int` }).from(gamificationCosmetics).leftJoin(gamificationInventory, eq(gamificationInventory.cosmeticId, gamificationCosmetics.id)).where(inArray(gamificationCosmetics.id, COSMETIC_CATALOG.map(item => item.id))).groupBy(gamificationCosmetics.id).orderBy(asc(gamificationCosmetics.id)).limit(50);
 return { courses: courses.slice(0, 20), moreCourses: courses.length > 20, page, q, selected: selected[0] ?? null, checklists: checklists.map(c => ({ id: c.id, version: c.version, status: c.status, totalXpMicro: c.totalXpMicro, credit: courseCreditMicro(c.totalXpMicro), counts: counts.filter(x => x.checklistId === c.id) })), preview, reports: reports.slice(0, 50), moreReports: reports.length > 50, reportPage, status, cosmetics };
}
export async function closeGamificationReport(adminId: string, id: string, resolution: 'resolved' | 'dismissed') {
 if (typeof id !== 'string' || !id || id.length > 200 || !['resolved', 'dismissed'].includes(resolution)) throw new Error('INVALID_REPORT');
 await db.transaction(async tx => {
  await assertAuthoringActor(tx, adminId, { roles: ['admin'], error: 'FORBIDDEN', lock: true });
  const [updated] = await tx.update(gamificationReports).set({ status: resolution, updatedAt: new Date() }).where(and(eq(gamificationReports.id, id), eq(gamificationReports.status, 'pending'))).returning({ id: gamificationReports.id });
  if (!updated) throw new Error('REPORT_NOT_PENDING');
  await tx.insert(auditMutasi).values({ id: crypto.randomUUID(), actorId: adminId, entityType: 'gamification_report', entityId: id, action: resolution, beforeSnapshot: { status: 'pending' }, afterSnapshot: { status: resolution }, outcome: 'success' });
 });
}
