import { and, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { courses, enrollments, discussionChannels, discussionMessages, discussionReports, discussionThreads, mataKuliah, penugasanTutor, pengguna, penggunaPeran, peran, tutorCourses, user } from "@/db/schema";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { resolveCourseEntitlementsBatch } from "@/lib/student/course-access";
import type { DiscussionActor } from "./contracts";
import { validDiscussionId } from "./policy";
import { getDiscussionRecipientAccess } from "./recipient-access";

export type DiscussionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | DiscussionTransaction;
type Channel = typeof discussionChannels.$inferSelect;
const denied = () => new Error("DISCUSSION_UNAVAILABLE");

type CourseScope = { canonicalCourseId: string | null; legacyCourseId: string | null; courseTitle: string | null; hasFullContentAccess: boolean; reason?: string };

async function pkaAllowed(actor: DiscussionActor, client: Connection) {
 if (process.env.FEATURE_PKA !== "1") return false;
 if (actor.role !== "student") return true;
 const [enrollment] = await client.select({ id: enrollments.id }).from(enrollments)
  .where(and(eq(enrollments.userId, actor.id), eq(enrollments.courseId, PKA_COURSE_ID))).limit(1);
 return Boolean(enrollment);
}

export async function resolveDiscussionCourses(actor: DiscussionActor, courseIds: readonly string[], client: Connection = db): Promise<Map<string, CourseScope>> {
 const ids = [...new Set(courseIds.filter(validDiscussionId))];
 if (!ids.length) return new Map();
 const batchSize = actor.role === "tutor" ? 500 : 5000;
 if (ids.length > batchSize) {
  const result = new Map<string, CourseScope>();
  for (let offset = 0; offset < ids.length; offset += batchSize)
   for (const [id, scope] of await resolveDiscussionCourses(actor, ids.slice(offset, offset + batchSize), client)) result.set(id, scope);
  return result;
 }
 const current = await getDiscussionActor(actor.id, client === db ? undefined : client as DiscussionTransaction);
 if (current.role !== actor.role) throw denied();
 let result: Map<string, CourseScope>;
 if (actor.role !== "tutor") result = await resolveCourseEntitlementsBatch(actor.id, ids, { executor: client });
 else {
 const [canonical, legacy] = await Promise.all([
  client.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId, title: mataKuliah.title, status: mataKuliah.status })
   .from(mataKuliah).where(or(inArray(mataKuliah.id, ids), inArray(mataKuliah.legacyCourseId, ids))),
  client.select({ id: courses.id }).from(courses).where(inArray(courses.id, ids)),
 ]);
 const canonicalIds = canonical.map(row => row.id), legacyIds = canonical.flatMap(row => row.legacyCourseId ? [row.legacyCourseId] : []);
 const [assignments, fallback] = await Promise.all([
  canonicalIds.length ? client.select({ id: penugasanTutor.mataKuliahId, status: penugasanTutor.status, scope: penugasanTutor.assignmentScope })
   .from(penugasanTutor).where(and(eq(penugasanTutor.penggunaId, actor.id), inArray(penugasanTutor.mataKuliahId, canonicalIds))) : [],
  legacyIds.length ? client.select({ id: tutorCourses.courseId }).from(tutorCourses)
   .where(and(eq(tutorCourses.tutorId, actor.id), inArray(tutorCourses.courseId, legacyIds))) : [],
 ]);
 const byAlias = new Map<string, typeof canonical>();
 for (const row of canonical) for (const alias of new Set([row.id, row.legacyCourseId].filter((id): id is string => !!id))) {
  const matches = byAlias.get(alias) ?? []; matches.push(row); byAlias.set(alias, matches);
 }
 const legacySet = new Set(legacy.map(row => row.id));
 const assignedCourses = new Map<string, boolean>();
 for (const assignment of assignments) assignedCourses.set(assignment.id, Boolean(assignedCourses.get(assignment.id)) || (assignment.status === "active" && assignment.scope === "course"));
 const fallbackCourses = new Set(fallback.map(assignment => assignment.id));
 result = new Map(ids.map(id => {
  const matches = byAlias.get(id) ?? [];
  const legacyRow = legacySet.has(id);
  const row = matches.length === 1 ? matches[0] : undefined;
  const ambiguous = matches.length > 1 || Boolean(row && legacyRow && row.legacyCourseId !== id);
  const assigned = row && assignedCourses.has(row.id) ? assignedCourses.get(row.id)
   : !!row?.legacyCourseId && fallbackCourses.has(row.legacyCourseId);
  return [id, { canonicalCourseId: row?.id ?? null, legacyCourseId: row?.legacyCourseId ?? (legacyRow ? id : null),
   courseTitle: row?.title ?? null, hasFullContentAccess: Boolean(!ambiguous && row?.status === "active" && assigned),
   ...(ambiguous ? { reason: "COURSE_MAPPING_AMBIGUOUS" } : {}) }];
 }));
 }
 if ([...result.values()].some(entry => entry.canonicalCourseId === PKA_COURSE_ID || entry.legacyCourseId === PKA_COURSE_ID)
  && !(await pkaAllowed(actor, client))) {
  for (const entry of result.values()) if (entry.canonicalCourseId === PKA_COURSE_ID || entry.legacyCourseId === PKA_COURSE_ID) entry.hasFullContentAccess = false;
 }
 return result;
}

function scopeAllowed(channel: Pick<Channel, "courseId" | "legacyCourseId">, access: Map<string, CourseScope>): boolean {
 if (!channel.courseId && !channel.legacyCourseId) return true;
 return [channel.courseId, channel.legacyCourseId].filter((id): id is string => !!id).every(id => {
  const entry = access.get(id);
  return !!entry?.hasFullContentAccess && !entry.reason && entry.canonicalCourseId === channel.courseId && entry.legacyCourseId === channel.legacyCourseId;
 });
}

export function discussionChannelCandidateScope(actor: DiscussionActor) {
 const publicKinds = inArray(discussionChannels.kind, ["global", "course"]);
 if (actor.role !== "tutor") return publicKinds;
 // Prune unassigned scopes before catalog discovery; the resolver still rejects ambiguous aliases and rechecks access.
 const assigned = sql`exists (select 1 from ${mataKuliah} candidate_course where candidate_course.status = 'active'
  and (candidate_course.id = ${discussionChannels.courseId} or candidate_course.legacy_course_id = ${discussionChannels.courseId}
   or candidate_course.id = ${discussionChannels.legacyCourseId} or candidate_course.legacy_course_id = ${discussionChannels.legacyCourseId})
  and (exists (select 1 from ${penugasanTutor} assignment where assignment.pengguna_id = ${actor.id}
    and assignment.mata_kuliah_id = candidate_course.id and assignment.status = 'active' and assignment.assignment_scope = 'course')
   or (not exists (select 1 from ${penugasanTutor} assignment where assignment.pengguna_id = ${actor.id} and assignment.mata_kuliah_id = candidate_course.id)
    and exists (select 1 from ${tutorCourses} fallback where fallback.tutor_id = ${actor.id} and fallback.course_id = candidate_course.legacy_course_id))))`;
 return and(publicKinds, or(and(isNull(discussionChannels.courseId), isNull(discussionChannels.legacyCourseId)), assigned));
}

export function discussionChannelsWithThreads() {
 return inArray(discussionChannels.id, db.select({ id: discussionThreads.channelId }).from(discussionThreads));
}

export function discussionChannelsWithPendingReports() {
 return inArray(discussionChannels.id, db.select({ id: discussionThreads.channelId }).from(discussionReports)
  .innerJoin(discussionMessages, eq(discussionMessages.id, discussionReports.messageId))
  .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
  .where(eq(discussionReports.status, "pending")));
}

/** discoveryScope limits entitlement lookup only; the caller must enforce that context in its query. */
export async function getDiscussionChannelVisibility(actorId: string, options: { scope?: SQL; discoveryScope?: SQL; includeRepairable?: boolean } = {}) {
 const actor = await getDiscussionActor(actorId);
 const scopes = await db.selectDistinct({ courseId: sql<string | null>`${discussionChannels.courseId}`, legacyCourseId: sql<string | null>`${discussionChannels.legacyCourseId}` })
  .from(discussionChannels).where(and(discussionChannelCandidateScope(actor), options.scope, options.discoveryScope));
 const ids = [...new Set(scopes.flatMap(scope => [scope.courseId, scope.legacyCourseId].filter((id): id is string => !!id)))];
 const access = await resolveDiscussionCourses(actor, ids);
 if (options.includeRepairable) {
  const missing = [...new Set(scopes.filter(scope => Boolean(scope.courseId) !== Boolean(scope.legacyCourseId))
   .flatMap(scope => {
    const entry = access.get((scope.courseId ?? scope.legacyCourseId)!);
    return entry?.hasFullContentAccess && !entry.reason
     ? [entry.canonicalCourseId, entry.legacyCourseId].filter((id): id is string => !!id && !access.has(id)) : [];
   }))];
  if (missing.length) for (const [id, entry] of await resolveDiscussionCourses(actor, missing)) access.set(id, entry);
 }
 const allowed = scopes.filter(scope => (scope.courseId || scope.legacyCourseId) && scopeAllowed(scope, access))
  .map(scope => ({ course_id: scope.courseId, legacy_course_id: scope.legacyCourseId }));
 const scoped = allowed.length ? sql`exists (select 1 from jsonb_to_recordset(${JSON.stringify(allowed)}::jsonb) as permitted(course_id text, legacy_course_id text)
  where permitted.course_id is not distinct from ${discussionChannels.courseId} and permitted.legacy_course_id is not distinct from ${discussionChannels.legacyCourseId})` : sql`false`;
 const repairable = options.includeRepairable ? scopes.flatMap(scope => {
  if (Boolean(scope.courseId) === Boolean(scope.legacyCourseId) || scopeAllowed(scope, access)) return [];
  const entry = access.get((scope.courseId ?? scope.legacyCourseId)!);
  if (!entry?.canonicalCourseId || !entry.legacyCourseId || (scope.courseId && scope.courseId !== entry.canonicalCourseId)
   || (scope.legacyCourseId && scope.legacyCourseId !== entry.legacyCourseId)
   || !scopeAllowed({ courseId: entry.canonicalCourseId, legacyCourseId: entry.legacyCourseId }, access)) return [];
  return [{ course_id: scope.courseId, legacy_course_id: scope.legacyCourseId, canonical: entry.canonicalCourseId, legacy: entry.legacyCourseId }];
 }) : [];
 const canRepair = repairable.length ? sql`exists (select 1 from jsonb_to_recordset(${JSON.stringify(repairable)}::jsonb)
  as permitted(course_id text, legacy_course_id text, canonical text, legacy text)
  where permitted.course_id is not distinct from ${discussionChannels.courseId} and permitted.legacy_course_id is not distinct from ${discussionChannels.legacyCourseId}
   and not exists (select 1 from discussion_channels conflict where conflict.id <> ${discussionChannels.id}
    and conflict.kind = ${discussionChannels.kind} and conflict.requester_id is not distinct from ${discussionChannels.requesterId}
    and (conflict.course_id = permitted.canonical or conflict.legacy_course_id = permitted.legacy)))` : sql`false`;
 return { actor, predicate: and(discussionChannelCandidateScope(actor), options.scope,
  or(and(isNull(discussionChannels.courseId), isNull(discussionChannels.legacyCourseId)), scoped, canRepair))! };
}

/** Revalidates the current actor and returns only current authorized channels. */
export async function getAccessibleDiscussionChannels(actorId: string, options: { channelIds?: readonly string[] } = {}): Promise<Channel[]> {
 const actor = await getDiscussionActor(actorId);
 const ids = options.channelIds && [...new Set(options.channelIds.filter(validDiscussionId))];
 if (ids && !ids.length) return [];
 const rows = await db.select().from(discussionChannels).where(and(ids ? inArray(discussionChannels.id, ids) : undefined, discussionChannelCandidateScope(actor)));
 const courseIds = [...new Set(rows.flatMap(row => [row.courseId, row.legacyCourseId].filter((id): id is string => !!id)))];
 const access = await resolveDiscussionCourses(actor, courseIds);
 return rows.filter(row => scopeAllowed(row, access));
}

export async function getDiscussionActor(id: string, tx?: DiscussionTransaction): Promise<DiscussionActor> {
 if (!validDiscussionId(id)) throw denied();
 const client = tx ?? db;
 const userQuery = client.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
 const identityQuery = client.select({ status: pengguna.status }).from(pengguna).where(eq(pengguna.id, id)).limit(1);
 const roleQuery = client.select({ code: peran.code }).from(penggunaPeran).innerJoin(peran, eq(peran.id, penggunaPeran.peranId)).where(eq(penggunaPeran.penggunaId, id));
 const [users, identities, roles] = tx
  ? [await userQuery.for("share"), await identityQuery.for("share"), await roleQuery.for("share")]
  : await Promise.all([userQuery, identityQuery, roleQuery]);
 if (!users.length || identities[0]?.status !== "active") throw denied();
 const codes = new Set(roles.map(row => row.code));
 const role = codes.has("admin") ? "admin" : codes.has("tutor") ? "tutor" : codes.has("murid") ? "student" : null;
 if (!role) throw denied();
 return { id, role };
}

/** Lock the same identity and role rows as individual transactional access checks. */
export async function requireDiscussionMentionAccess(tx: DiscussionTransaction, channelId: string, userIds: readonly string[]) {
 if (!userIds.length) return;
 if (userIds.length > 10 || !userIds.every(validDiscussionId) || new Set(userIds).size !== userIds.length) throw denied();
 await tx.select({ id: user.id }).from(user).where(inArray(user.id, userIds)).orderBy(user.id).for("share");
 await tx.select({ id: pengguna.id }).from(pengguna).where(inArray(pengguna.id, userIds)).orderBy(pengguna.id).for("share");
 await tx.select({ id: penggunaPeran.penggunaId }).from(penggunaPeran).innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
  .where(inArray(penggunaPeran.penggunaId, userIds)).orderBy(penggunaPeran.penggunaId, peran.id).for("share");
 if ((await getDiscussionRecipientAccess(channelId, userIds, tx)).size !== userIds.length) throw denied();
}

/** Both aliases must resolve to the same current identity before they can name an audience. */
export async function requireDiscussionCourse(actor: DiscussionActor, courseId: string | null, legacyCourseId: string | null, client: Connection = db) {
 const ids = [courseId, legacyCourseId].filter((value): value is string => !!value);
 if (!ids.length) throw denied();
 const access = await resolveDiscussionCourses(actor, ids, client);
 if (!scopeAllowed({ courseId, legacyCourseId }, access)) throw denied();
 return access.get(ids[0])!;
}

export async function requireDiscussionChannelAccess(actor: DiscussionActor, channelId: string, tx?: DiscussionTransaction): Promise<Channel> {
 if (!validDiscussionId(channelId)) throw denied();
 const client = tx ?? db;
 const current = await getDiscussionActor(actor.id, tx);
 const [channel] = await client.select().from(discussionChannels).where(eq(discussionChannels.id, channelId)).limit(1);
 if (!channel) throw denied();
 if (channel.kind === "global") return channel;
 if (channel.kind !== "course") throw denied();
 if (channel.courseId || channel.legacyCourseId) await requireDiscussionCourse(current, channel.courseId, channel.legacyCourseId, client);
 return channel;
}

export async function requireDiscussionThreadAccess(actor: DiscussionActor, threadId: string, tx?: DiscussionTransaction) {
 if (!validDiscussionId(threadId)) throw denied();
 const client = tx ?? db;
 const [thread] = await client.select().from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1);
 if (!thread) throw denied();
 const channel = await requireDiscussionChannelAccess(actor, thread.channelId, tx);
 return { channel, thread };
}

export async function requireDiscussionMessageAccess(actor: DiscussionActor, messageId: string, tx?: DiscussionTransaction) {
 if (!validDiscussionId(messageId)) throw denied();
 const client = tx ?? db;
 const [message] = await client.select().from(discussionMessages).where(eq(discussionMessages.id, messageId)).limit(1);
 if (!message) throw denied();
 const { channel, thread } = await requireDiscussionThreadAccess(actor, message.threadId, tx);
 return { channel, thread, message };
}

export async function canAccessDiscussionChannel(userId: string, channelId: string): Promise<boolean> {
 try {
  const actor = await getDiscussionActor(userId);
  await requireDiscussionChannelAccess(actor, channelId);
  return true;
 } catch (error) {
  if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") return false;
  throw error;
 }
}

/** Candidates are not authorized recipients; callers must recheck current access. */
export async function getDiscussionCandidateUserIdsPage(channelId: string, options: { cursor?: string | null; limit?: number } = {}): Promise<{ items: string[]; nextCursor: string | null }> {
 if (!validDiscussionId(channelId)) throw denied();
 if (options.cursor != null && !validDiscussionId(options.cursor)) throw denied();
 const limit = options.limit ?? 100;
 if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw denied();
 const [channel] = await db.select().from(discussionChannels).where(eq(discussionChannels.id, channelId)).limit(1);
 if (!channel || (channel.kind !== "global" && channel.kind !== "course")) throw denied();
 const rows = await db.selectDistinct({ id: pengguna.id }).from(pengguna)
  .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id))
  .innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
  .where(and(eq(pengguna.status, "active"), options.cursor ? gt(pengguna.id, options.cursor) : undefined, inArray(peran.code, ["admin", "tutor", "murid"])))
  .orderBy(pengguna.id).limit(limit + 1);
 const items = rows.slice(0, limit).map(row => row.id);
 return { items, nextCursor: rows.length > limit ? items[items.length - 1] : null };
}

export async function getDiscussionCandidateUserIds(channelId: string): Promise<string[]> {
 const authorized: string[] = [];
 let cursor: string | null = null;
 do {
  const page = await getDiscussionCandidateUserIdsPage(channelId, { cursor });
  for (let offset = 0; offset < page.items.length; offset += 10) {
   const batch = await Promise.all(page.items.slice(offset, offset + 10).map(async id => await canAccessDiscussionChannel(id, channelId) ? id : null));
   authorized.push(...batch.filter((id): id is string => id !== null));
  }
  cursor = page.nextCursor;
 } while (cursor);
 return authorized;
}
