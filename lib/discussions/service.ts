import { wakeOutbox } from "@/lib/queue/outbox";
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
 courses, enrollments, discussionAiRequests, discussionAttachments, discussionChannelPreferences, discussionChannels, discussionEvents, nameSearchBigrams,
 discussionMessageObservations, discussionMessages, discussionReactions, discussionReports, discussionThreadParticipants, discussionThreadReads, discussionThreads,
 gamificationCosmetics, gamificationInventory, gamificationSocialRateLimits, mataKuliah, pendaftaranMurid, penugasanTutor, pengguna, penggunaPeran, peran, tutorCourses, user,
} from "@/db/schema";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { eligibleStudent, noBlock } from "@/lib/gamification/social-sql";
import { attachDiscussionImages, listDiscussionAttachmentsForMessages } from "./images";
import { enqueueDiscussionReward } from "./rewards";
import { clearDiscussionNotificationsThroughSeq } from "./notifications";
import { recordDiscussionParticipant } from "./participants";
import { cacheDiscussionCounts, getCachedDiscussionCounts } from "./count-cache";
import { signDiscussionReadReceipt, verifyDiscussionReadReceipt } from "./read-receipt";
import { getAccessibleDiscussionChannels, getDiscussionActor, getDiscussionChannelVisibility, requireDiscussionChannelAccess, requireDiscussionMessageAccess, requireDiscussionThreadAccess, resolveDiscussionCourses, type DiscussionTransaction } from "./access";
import { getDiscussionRecipientAccess } from "./recipient-access";
import * as discussionAccess from "./access";
import { discussionMentionTokens, canDeleteDiscussionMessage, canEditDiscussionMessage, canForwardDiscussion, deriveInitialDiscussionTitle, DISCUSSION_REACTIONS, validDiscussionId, validDiscussionReplyType, validDiscussionText } from "./policy";
import type { CreateDiscussionThread, DiscussionActor, DiscussionAuthorProfile, DiscussionStudentProfile, DiscussionChannel, DiscussionChannelKind, DiscussionMessage, DiscussionPage, DiscussionReport, DiscussionRole, DiscussionSubmit, DiscussionThread, ReplyToDiscussion } from "./contracts";

const PAGE_SIZE = 30;
const unavailable = () => new Error("DISCUSSION_UNAVAILABLE");
const invalid = () => new Error("DISCUSSION_INVALID");
const id = () => crypto.randomUUID();
type ChannelRow = typeof discussionChannels.$inferSelect;
type ThreadRow = typeof discussionThreads.$inferSelect;
type MessageRow = typeof discussionMessages.$inferSelect;

function checkId(value: unknown): asserts value is string { if (!validDiscussionId(value)) throw invalid(); }
function parseSubmit(input: DiscussionSubmit) {
 if (!input || typeof input.body !== "string" || input.body.length > 12000 || input.body.includes("\0") || !validDiscussionId(input.requestId)
  || !Array.isArray(input.attachmentIds) || input.attachmentIds.length > 4 || !input.attachmentIds.every(validDiscussionId)
  || new Set(input.attachmentIds).size !== input.attachmentIds.length || !Array.isArray(input.mentionIds) || input.mentionIds.length > 10
  || !input.mentionIds.every(validDiscussionId) || new Set(input.mentionIds).size !== input.mentionIds.length
  || (!input.body.trim() && !input.attachmentIds.length) || typeof input.askZyra !== "boolean"
  || (input.skinId != null && !validDiscussionId(input.skinId))) throw invalid();
 if (input.mentionHandles !== undefined) {
  const handles = input.mentionHandles;
  if (!Array.isArray(handles) || handles.length !== input.mentionIds.length ||
   !handles.every(handle => typeof handle === "string" && /^[\p{L}\p{N}_]{1,64}$/u.test(handle))) throw invalid();
  const tokens = discussionMentionTokens(input.body);
  const normalized = handles.map(handle => handle.toLowerCase());
  if (new Set(normalized).size !== normalized.length || normalized.some(handle => handle === "zyra" || !tokens.has(handle))) throw invalid();
 }
 return { ...input, body: input.body.trim(), skinId: input.skinId ?? null };
}
function submissionFingerprint(actorId: string, requestId: string, scope: unknown[], input?: ReturnType<typeof parseSubmit>) {
 return createHash("sha256").update(JSON.stringify(["discussion-submission-v1", actorId, requestId, scope,
  input ? [input.body, [...input.attachmentIds].sort(), [...input.mentionIds].sort(), input.askZyra, input.skinId,
   ...(input.mentionHandles?.length ? [input.mentionIds.map((id, index) => [id, input.mentionHandles![index]])] : [])] : null])).digest("hex");
}
function encodeCursor(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor(cursor: string | undefined): unknown {
 if (!cursor) return null;
 if (typeof cursor !== "string" || cursor.length > 500) throw invalid();
 try { return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw invalid(); }
}
function pageCursor(cursor: string | undefined): { at: string; id: string } | null {
 const value = decodeCursor(cursor) as { at?: unknown; id?: unknown } | null;
 if (!value) return null;
 if (typeof value.at !== "string" || !validDiscussionId(value.id)) throw invalid();
 const at = new Date(value.at);
 if (!Number.isFinite(at.getTime())) throw invalid();
 return { at: value.at, id: value.id };
}
function messageCursor(cursor: string | undefined): number {
 const value = decodeCursor(cursor);
 if (value === null) return 0;
 if (!Number.isSafeInteger(value) || Number(value) < 0) throw invalid();
 return Number(value);
}

async function admit(actorId: string, category: "write" | "report" | "read") {
 const limit = category === "report" ? 10 : category === "read" ? 300 : 60;
 const seconds = category === "report" ? 86400 : 60;
 const allowed = await db.transaction(async tx => {
  await getDiscussionActor(actorId, tx);
  const result = await tx.execute<{ attempts: number }>(sql`insert into ${gamificationSocialRateLimits} (user_id, action, window_key, attempts, expires_at)
   values (${actorId}, ${`discussion_${category}`}, 'rolling', 1, now() + ${seconds} * interval '1 second')
   on conflict (user_id, action, window_key) do update set
    attempts = case when ${gamificationSocialRateLimits.expiresAt} <= now() then 1 else ${gamificationSocialRateLimits.attempts} + 1 end,
    expires_at = case when ${gamificationSocialRateLimits.expiresAt} <= now() then now() + ${seconds} * interval '1 second' else ${gamificationSocialRateLimits.expiresAt} end
   returning attempts`);
  return Number(result.rows[0].attempts) <= limit;
 });
 if (!allowed) throw new Error("DISCUSSION_RATE_LIMITED");
}

async function channelForScope(actor: DiscussionActor, kind: DiscussionChannelKind, courseId: string | null, legacyCourseId: string | null, title: string): Promise<ChannelRow> {
 if (kind !== "global" && kind !== "course") throw unavailable();
 const condition = and(eq(discussionChannels.kind, kind), isNull(discussionChannels.requesterId),
  courseId || legacyCourseId ? or(courseId ? eq(discussionChannels.courseId, courseId) : undefined,
   legacyCourseId ? eq(discussionChannels.legacyCourseId, legacyCourseId) : undefined)
   : and(isNull(discussionChannels.courseId), isNull(discussionChannels.legacyCourseId)));
 let matches = await db.select().from(discussionChannels).where(condition).limit(2);
 if (matches.length > 1) throw unavailable();
 if (!matches.length) {
  await db.insert(discussionChannels).values({ id: id(), kind, courseId, legacyCourseId, requesterId: null, title }).onConflictDoNothing();
  matches = await db.select().from(discussionChannels).where(condition).limit(2);
 }
 let [channel] = matches;
 if (matches.length !== 1 || (channel.courseId && channel.courseId !== courseId) || (channel.legacyCourseId && channel.legacyCourseId !== legacyCourseId)) throw unavailable();
 if (channel.courseId !== courseId || channel.legacyCourseId !== legacyCourseId) {
  try {
   const [updated] = await db.update(discussionChannels).set({ courseId, legacyCourseId })
    .where(and(eq(discussionChannels.id, channel.id), channel.courseId ? eq(discussionChannels.courseId, channel.courseId) : isNull(discussionChannels.courseId),
     channel.legacyCourseId ? eq(discussionChannels.legacyCourseId, channel.legacyCourseId) : isNull(discussionChannels.legacyCourseId))).returning();
   if (!updated) throw unavailable();
   channel = updated;
  } catch (error) {
   if ((error as { code?: string })?.code === "23505") throw unavailable();
   throw error;
  }
 }
 await requireDiscussionChannelAccess(actor, channel.id);
 return channel;
}

export async function ensureDiscussionTeamChannel(actorId: string, _team: "technical" | "academic", _requestedCourseId?: string): Promise<never> {
 await getDiscussionActor(actorId);
 throw unavailable();
}

async function ensureVisibleChannels(actor: DiscussionActor) {
 const [canonical, legacy, existing] = await Promise.all([
  db.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.status, "active")),
  db.select({ id: courses.id }).from(courses),
  db.select().from(discussionChannels).where(inArray(discussionChannels.kind, ["global", "course"])),
 ]);
 const base: Array<typeof discussionChannels.$inferInsert> = [];
 if (!existing.some(row => row.kind === "global")) base.push({ id: id(), kind: "global", title: "Umum" });
 if (base.length) await db.insert(discussionChannels).values(base).onConflictDoNothing();
 const ids = [...new Set([...canonical, ...legacy].map(row => row.id))];
 const access = await resolveDiscussionCourses(actor, ids);
 for (const row of existing) {
  if (Boolean(row.courseId) === Boolean(row.legacyCourseId)) continue;
  if (row.kind !== "course") continue;
  const entry = access.get((row.courseId ?? row.legacyCourseId)!);
  if (!entry?.hasFullContentAccess || entry.reason || !entry.canonicalCourseId || !entry.legacyCourseId ||
   (row.courseId && row.courseId !== entry.canonicalCourseId) || (row.legacyCourseId && row.legacyCourseId !== entry.legacyCourseId)) continue;
  if (![entry.canonicalCourseId, entry.legacyCourseId].every(alias => {
   const match = access.get(alias);
   return match?.hasFullContentAccess && !match.reason && match.canonicalCourseId === entry.canonicalCourseId && match.legacyCourseId === entry.legacyCourseId;
  })) continue;
  if (existing.some(other => other.id !== row.id && other.kind === row.kind && other.requesterId === row.requesterId &&
   (other.courseId === entry.canonicalCourseId || other.legacyCourseId === entry.legacyCourseId))) continue;
  try {
   await db.update(discussionChannels).set({ courseId: entry.canonicalCourseId, legacyCourseId: entry.legacyCourseId }).where(and(eq(discussionChannels.id, row.id),
    row.courseId ? eq(discussionChannels.courseId, row.courseId) : isNull(discussionChannels.courseId),
    row.legacyCourseId ? eq(discussionChannels.legacyCourseId, row.legacyCourseId) : isNull(discussionChannels.legacyCourseId)));
  } catch (error) {
   if ((error as { code?: string })?.code !== "23505") throw error;
  }
 }
 const seen = new Set<string>();
 const existingCourses = new Set(existing.filter(row => row.kind === "course").flatMap(row => [row.courseId, row.legacyCourseId].filter((value): value is string => !!value)));
 const insert: Array<typeof discussionChannels.$inferInsert> = [];
 for (const entry of access.values()) {
  const key = entry.canonicalCourseId ?? entry.legacyCourseId;
  if (!entry.hasFullContentAccess || entry.reason || !key || seen.has(key)) continue;
  const aliases = [entry.canonicalCourseId, entry.legacyCourseId].filter((value): value is string => !!value);
  if (!aliases.every(alias => { const match = access.get(alias); return match?.hasFullContentAccess && !match.reason && match.canonicalCourseId === entry.canonicalCourseId && match.legacyCourseId === entry.legacyCourseId; })) continue;
  seen.add(key);
  if (aliases.some(alias => existingCourses.has(alias))) continue;
  insert.push({ id: id(), kind: "course", courseId: entry.canonicalCourseId, legacyCourseId: entry.legacyCourseId, title: entry.courseTitle ?? "Mata kuliah" });
 }
 if (insert.length) await db.insert(discussionChannels).values(insert).onConflictDoNothing();
}

async function repairChannelAliases(actor: DiscussionActor, rows: ChannelRow[]) {
 const partial = rows.filter(row => Boolean(row.courseId) !== Boolean(row.legacyCourseId));
 if (!partial.length) return;
 const access = await resolveDiscussionCourses(actor, partial.flatMap(row => row.courseId ?? row.legacyCourseId ?? []));
 const missing = [...new Set([...access.values()].flatMap(entry => [entry.canonicalCourseId, entry.legacyCourseId].filter((alias): alias is string => !!alias && !access.has(alias))))];
 const aliases = missing.length ? await resolveDiscussionCourses(actor, missing) : new Map();
 for (const [key, value] of aliases) access.set(key, value);
 for (const row of partial) {
  const entry = access.get((row.courseId ?? row.legacyCourseId)!);
  if (!entry?.hasFullContentAccess || entry.reason || !entry.canonicalCourseId || !entry.legacyCourseId) continue;
  if (![entry.canonicalCourseId, entry.legacyCourseId].every(alias => {
   const match = access.get(alias);
   return match?.hasFullContentAccess && !match.reason && match.canonicalCourseId === entry.canonicalCourseId && match.legacyCourseId === entry.legacyCourseId;
  })) continue;
  try {
   await db.update(discussionChannels).set({ courseId: entry.canonicalCourseId, legacyCourseId: entry.legacyCourseId })
    .where(and(eq(discussionChannels.id, row.id), row.courseId ? eq(discussionChannels.courseId, row.courseId) : isNull(discussionChannels.courseId),
     row.legacyCourseId ? eq(discussionChannels.legacyCourseId, row.legacyCourseId) : isNull(discussionChannels.legacyCourseId)));
  } catch (error) {
   if ((error as { code?: string })?.code !== "23505") throw error;
  }
 }
}

export async function listChannels(actorId: string, channelIds?: string[]): Promise<DiscussionChannel[]> {
 const actor = await getDiscussionActor(actorId);
 if (channelIds !== undefined && (!Array.isArray(channelIds) || channelIds.length > 31 || !channelIds.every(validDiscussionId))) throw invalid();
 if (channelIds === undefined) await ensureVisibleChannels(actor);
 const allowed = await getAccessibleDiscussionChannels(actor.id, channelIds === undefined ? {} : { channelIds });
 if (!allowed.length) return [];
 const rows = await db.select({ channel: discussionChannels, muted: discussionChannelPreferences.muted,
 }).from(discussionChannels).leftJoin(discussionChannelPreferences, and(eq(discussionChannelPreferences.channelId, discussionChannels.id), eq(discussionChannelPreferences.userId, actor.id)))
  .where(inArray(discussionChannels.id, allowed.map(channel => channel.id)))
  .orderBy(asc(discussionChannels.kind), asc(discussionChannels.title), asc(discussionChannels.id));
 const authorized = new Map(allowed.map(channel => [channel.id, channel]));
 const visible = rows.filter(({ channel }) => {
  const checked = authorized.get(channel.id);
  return checked && checked.kind === channel.kind && checked.requesterId === channel.requesterId
   && checked.courseId === channel.courseId && checked.legacyCourseId === channel.legacyCourseId;
 });
 const counts = await getDiscussionCounts(actorId, { channelIds: visible.map(({ channel }) => channel.id) });
 return visible.map(({ channel, muted }): DiscussionChannel => ({
  id: channel.id, kind: channel.kind, title: channel.title, courseId: channel.courseId ?? channel.legacyCourseId,
  muted: muted ?? false, unreadThreads: counts.channels?.[channel.id]?.unreadThreads ?? 0, activeThreads: counts.channels?.[channel.id]?.activeThreads ?? 0,
 }));
}

export async function listChannelsPage(actorId: string, options: { cursor?: string; search?: string; courseId?: string; kind?: DiscussionChannelKind; kinds?: DiscussionChannelKind[]; limit?: number } = {}): Promise<DiscussionPage<DiscussionChannel>> {
 const actor = await getDiscussionActor(actorId);
 const isAllowedKind = (kind: DiscussionChannelKind): kind is "global" | "course" => kind === "global" || kind === "course";
 if (options.courseId !== undefined) checkId(options.courseId);
 if (options.kind !== undefined && !isAllowedKind(options.kind)) throw invalid();
 if (options.kinds !== undefined && (!Array.isArray(options.kinds) || options.kinds.length > 2 ||
  !options.kinds.every(isAllowedKind) || new Set(options.kinds).size !== options.kinds.length)) throw invalid();
 if (options.search !== undefined && (typeof options.search !== "string" || options.search.length > 160 || options.search.includes("\0"))) throw invalid();
 const limit = options.limit ?? 50;
 if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
 const after = decodeCursor(options.cursor) as { kind?: unknown; title?: unknown; id?: unknown } | null;
 if (after && (!isAllowedKind(after.kind as DiscussionChannelKind) || typeof after.title !== "string" || !validDiscussionId(after.id))) throw invalid();
 if (options.kinds?.length === 0 || (options.kind && options.kinds && !options.kinds.includes(options.kind))) return { items: [], nextCursor: null };
 let courseAliases: string[] | undefined;
 const courseEntry = options.courseId ? (await resolveDiscussionCourses(actor, [options.courseId])).get(options.courseId) : undefined;
 if (options.courseId) {
  if (!courseEntry?.hasFullContentAccess || courseEntry.reason) return { items: [], nextCursor: null };
  courseAliases = [courseEntry.canonicalCourseId, courseEntry.legacyCourseId].filter((value): value is string => !!value);
  const missingAliases = courseAliases.filter(alias => alias !== options.courseId);
  const scopes = new Map([[options.courseId, courseEntry], ...(missingAliases.length ? await resolveDiscussionCourses(actor, missingAliases) : [])]);
  if (!courseAliases.length || !courseAliases.every(alias => {
   const match = scopes.get(alias);
   return match?.hasFullContentAccess && !match.reason && match.canonicalCourseId === courseEntry?.canonicalCourseId && match.legacyCourseId === courseEntry?.legacyCourseId;
  })) return { items: [], nextCursor: null };
 }
 if (!after && !options.search?.trim()) {
  if (courseEntry) {
   const entry = courseEntry;
   try {
    await channelForScope(actor, "course", entry.canonicalCourseId, entry.legacyCourseId, entry.courseTitle ?? "Mata kuliah");
   } catch (error) {
    if (!(error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE")) throw error;
   }
  } else if (!options.kind && !options.kinds) await ensureVisibleChannels(actor);
 }
 const search = options.search?.trim().replace(/[\\%_]/g, "\\$&");
 const pattern = search ? `%${search}%` : null;
 const scope = and(
   options.kind ? eq(discussionChannels.kind, options.kind) : undefined, options.kinds ? inArray(discussionChannels.kind, options.kinds) : undefined,
   courseAliases ? or(inArray(discussionChannels.courseId, courseAliases), inArray(discussionChannels.legacyCourseId, courseAliases)) : undefined,
   pattern ? or(sql`${discussionChannels.title} ilike ${pattern} escape '\\'`, and(
    eq(discussionChannels.kind, "course"), or(
     sql`exists (select 1 from ${mataKuliah} course where (course.id = ${discussionChannels.courseId}
      or (${discussionChannels.courseId} is null and course.legacy_course_id = ${discussionChannels.legacyCourseId})) and course.title ilike ${pattern} escape '\\')`,
     sql`${discussionChannels.courseId} is null and exists (select 1 from ${courses} course where course.id = ${discussionChannels.legacyCourseId}
      and course.title ilike ${pattern} escape '\\') and not exists (select 1 from ${mataKuliah} canonical
       where canonical.id = ${discussionChannels.legacyCourseId} or canonical.legacy_course_id = ${discussionChannels.legacyCourseId})`,
    ),
   )) : undefined,
   after ? or(gt(discussionChannels.kind, after.kind as DiscussionChannelKind), and(eq(discussionChannels.kind, after.kind as DiscussionChannelKind),
    or(gt(discussionChannels.title, after.title as string), and(eq(discussionChannels.title, after.title as string), gt(discussionChannels.id, after.id as string))))) : undefined);
 const { predicate } = await getDiscussionChannelVisibility(actor.id, { scope, includeRepairable: true });
 let cursor = after;
 const authorized: ChannelRow[] = [];
 while (authorized.length <= limit) {
  const batchSize = Math.min(100, limit + 1 - authorized.length);
  const candidates = await db.select().from(discussionChannels).where(and(predicate,
   cursor ? or(gt(discussionChannels.kind, cursor.kind as DiscussionChannelKind), and(eq(discussionChannels.kind, cursor.kind as DiscussionChannelKind),
    or(gt(discussionChannels.title, cursor.title as string), and(eq(discussionChannels.title, cursor.title as string), gt(discussionChannels.id, cursor.id as string))))) : undefined))
   .orderBy(asc(discussionChannels.kind), asc(discussionChannels.title), asc(discussionChannels.id)).limit(batchSize);
  if (!candidates.length) break;
  if ((await getDiscussionActor(actor.id)).role !== actor.role) throw unavailable();
  await repairChannelAliases(actor, candidates);
  const allowed = new Map((await getAccessibleDiscussionChannels(actor.id, { channelIds: candidates.map(row => row.id) })).map(row => [row.id, row]));
  for (const candidate of candidates) {
   const channel = allowed.get(candidate.id);
   if (channel) authorized.push(channel);
   if (authorized.length > limit) break;
  }
  const lastCandidate = candidates.at(-1)!;
  cursor = { kind: lastCandidate.kind, title: lastCandidate.title, id: lastCandidate.id };
  if (candidates.length < batchSize) break;
 }
 const page = authorized.slice(0, limit), last = page.at(-1);
 const batches: string[][] = [];
 for (let offset = 0; offset < page.length; offset += 31) batches.push(page.slice(offset, offset + 31).map(row => row.id));
 const items = (await Promise.all(batches.map(ids => listChannels(actor.id, ids)))).flat();
 return { items, nextCursor: authorized.length > limit && last ? encodeCursor({ kind: last.kind, title: last.title, id: last.id }) : null };
}

export async function getDiscussionCounts(actorId: string, options: { courseId?: string; channelIds?: string[] } = {}) {
 if (options.courseId !== undefined) checkId(options.courseId);
 if (options.channelIds !== undefined && (!Array.isArray(options.channelIds) || !options.channelIds.every(validDiscussionId))) throw invalid();
 const matches = and(options.channelIds ? (options.channelIds.length ? inArray(discussionChannels.id, options.channelIds) : sql`false`) : undefined,
  options.courseId ? and(eq(discussionChannels.kind, "course"), or(eq(discussionChannels.courseId, options.courseId), eq(discussionChannels.legacyCourseId, options.courseId))) : undefined);
 const discoverStaffThreads = !options.courseId && !options.channelIds && (await getDiscussionActor(actorId)).role !== "student";
 const cacheScope = createHash("sha256").update(JSON.stringify([actorId, options.courseId ?? null, options.channelIds ? [...options.channelIds].sort() : null])).digest("hex");
 const version = async () => {
  const threadBearing = and(discoverStaffThreads ? sql`${discussionChannels.countRevision} > 0` : undefined,
   sql`(select 1 from ${discussionThreads} where ${discussionThreads.channelId} = ${discussionChannels.id}
    order by ${discussionThreads.lastActivityAt}, ${discussionThreads.id} limit 1) is not null`)!;
  const { actor, predicate } = options.channelIds
   ? { actor: await getDiscussionActor(actorId), predicate: matches }
   : await getDiscussionChannelVisibility(actorId, { scope: matches, discoveryScope: threadBearing });
  const candidates = await db.select({ id: sql<string>`"discussion_channels"."id"` }).from(discussionChannels).where(and(predicate, threadBearing));
  const channels: ChannelRow[] = [];
  for (let offset = 0; offset < candidates.length; offset += 500) {
   channels.push(...await getAccessibleDiscussionChannels(actorId, { channelIds: candidates.slice(offset, offset + 500).map(row => row.id) }));
  }
  if ((await getDiscussionActor(actorId)).role !== actor.role) throw unavailable();
  const authorized = channels.filter(channel => (!options.channelIds || options.channelIds.includes(channel.id)) && (!options.courseId || (channel.kind === "course" &&
   (channel.courseId === options.courseId || channel.legacyCourseId === options.courseId)))).sort((a, b) => a.id.localeCompare(b.id));
  const reads = authorized.length ? await db.select({ channelId: discussionChannelPreferences.channelId, revision: discussionChannelPreferences.readRevision })
   .from(discussionChannelPreferences).where(and(eq(discussionChannelPreferences.userId, actorId),
    sql`${discussionChannelPreferences.channelId} = any(${sql.param(authorized.map(channel => channel.id))}::text[])`)) : [];
  const readRevisions = new Map(reads.map(row => [row.channelId, String(row.revision)]));
  const revisions = authorized.map(channel => {
   const revision = String(channel.countRevision), readRevision = readRevisions.get(channel.id) ?? "0";
   if (!/^\d+$/.test(revision) || !/^\d+$/.test(readRevision)) throw unavailable();
   return [channel.id, channel.kind, revision, readRevision];
  });
  const key = createHash("sha256").update(JSON.stringify([actorId, actor.role, options.courseId ?? null, options.channelIds ? [...options.channelIds].sort() : null, revisions])).digest("hex");
  return { key, channels: authorized };
 };
 for (let attempt = 0; attempt < 3; attempt++) {
  const before = await version();
  let result = getCachedDiscussionCounts(cacheScope, before.key);
  const cached = Boolean(result);
  if (!result) {
   const empty = () => ({ unreadThreads: 0, activeThreads: 0 });
   const scopes = { global: empty(), course: empty(), technical: empty(), academic: empty() }, total = empty();
   const kinds = new Map(before.channels.map(channel => [channel.id, channel.kind] as const));
   const rows = kinds.size ? await db.select({ channelId: discussionThreads.channelId,
    activeThreads: sql<number>`count(*) filter (where ${discussionThreads.status} = 'open')::int`,
    unreadThreads: sql<number>`count(*) filter (where exists (select 1 from discussion_messages m where m.thread_id = discussion_threads.id
     and m.seq > coalesce((select r.through_seq from discussion_thread_reads r where r.thread_id = discussion_threads.id and r.user_id = ${actorId}), 0)
     and m.deleted_at is null and m.author_id is distinct from ${actorId}))::int`,
   }).from(discussionThreads).where(sql`${discussionThreads.channelId} = any(${sql.param([...kinds.keys()])}::text[])`).groupBy(discussionThreads.channelId) : [];
   for (const row of rows) {
    const kind = kinds.get(row.channelId);
    if (!kind) continue;
    scopes[kind].unreadThreads += Number(row.unreadThreads); scopes[kind].activeThreads += Number(row.activeThreads);
    total.unreadThreads += Number(row.unreadThreads); total.activeThreads += Number(row.activeThreads);
   }
   result = { total, scopes, course: options.courseId ? { ...total } : null,
    ...(options.channelIds ? { channels: Object.fromEntries(rows.filter(row => kinds.has(row.channelId)).map(row => [row.channelId, { unreadThreads: Number(row.unreadThreads), activeThreads: Number(row.activeThreads) }])) } : {}) };
  }
  if ((await version()).key !== before.key) continue;
  if (!cached) cacheDiscussionCounts(cacheScope, result, before.key);
  return result;
 }
 throw unavailable();
}

async function threadCounts(actorId: string, threadIds: string[]) {
 if (!threadIds.length) return new Map<string, { answerCount: number; unreadCount: number }>();
 const rows = await db.select({ threadId: discussionThreads.id,
  answerCount: discussionThreads.answerCount,
  unreadCount: sql<number>`(select count(*)::int from discussion_messages m where m.thread_id = ${discussionThreads.id} and m.seq > coalesce(${discussionThreadReads.throughSeq}, 0) and m.deleted_at is null and m.author_id is distinct from ${actorId})`,
 }).from(discussionThreads).leftJoin(discussionThreadReads, and(eq(discussionThreadReads.threadId, discussionThreads.id), eq(discussionThreadReads.userId, actorId)))
  .where(inArray(discussionThreads.id, threadIds));
 return new Map(rows.map(row => [row.threadId, { answerCount: Number(row.answerCount), unreadCount: Number(row.unreadCount) }]));
}
function threadDto(actor: DiscussionActor, thread: ThreadRow, counts: { answerCount: number; unreadCount: number } | undefined): DiscussionThread {
 return { id: thread.id, channelId: thread.channelId, title: thread.title, status: thread.status,
  labels: thread.helpKind ? [thread.helpKind, ...thread.labels.filter(label => label !== thread.helpKind)] : thread.labels, helpKind: thread.helpKind,
  createdAt: thread.createdAt.toISOString(), lastActivityAt: thread.lastActivityAt.toISOString(), answerCount: counts?.answerCount ?? 0,
  unreadCount: counts?.unreadCount ?? 0, canReply: thread.status === "open", canResolve: actor.role === "admin" || thread.authorId === actor.id };
}

export async function listThreads(actorId: string, channelId: string, cursor?: string): Promise<DiscussionPage<DiscussionThread>> {
 return listThreadsAcrossChannels(actorId, { channelId, cursor });
}

export async function listThreadsAcrossChannels(actorId: string, options: { channelId?: string; search?: string; cursor?: string; status?: DiscussionThread["status"] } = {}): Promise<DiscussionPage<DiscussionThread>> {
 const actor = await getDiscussionActor(actorId);
 if (options.channelId !== undefined) checkId(options.channelId);
 if (options.search !== undefined && (typeof options.search !== "string" || options.search.length > 160 || options.search.includes("\0"))) throw invalid();
 if (options.status !== undefined && options.status !== "open" && options.status !== "resolved") throw invalid();
 let channelFilter;
 if (options.channelId) {
  const channels = await getAccessibleDiscussionChannels(actor.id, { channelIds: [options.channelId] });
  if (!channels.length) throw unavailable();
  channelFilter = eq(discussionThreads.channelId, options.channelId);
 } else {
  const { predicate } = await getDiscussionChannelVisibility(actor.id, { discoveryScope: discussionAccess.discussionChannelsWithThreads() });
  channelFilter = inArray(discussionThreads.channelId, db.select({ id: discussionChannels.id }).from(discussionChannels).where(predicate));
 }
 const after = pageCursor(options.cursor);
 const rawSearch = options.search?.trim() ?? "";
 const search = rawSearch.replace(/[\\%_]/g, "\\$&");
 const tsTokens = rawSearch.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
 const prefixTsQuery = tsTokens.map(token => `${token}:*`).join(" & ");
 const searchPredicate = rawSearch
  ? prefixTsQuery
   ? or(
    sql`${discussionThreads.title} ilike ${`%${search}%`} escape '\\'`,
    sql`to_tsvector('simple', ${discussionThreads.title}) @@ to_tsquery('simple', ${prefixTsQuery})`,
    sql`exists (
     select 1 from ${discussionMessages}
     where ${discussionMessages.threadId} = ${discussionThreads.id}
      and ${discussionMessages.deletedAt} is null
      and to_tsvector('simple', ${discussionMessages.body}) @@ to_tsquery('simple', ${prefixTsQuery})
    )`
   )
   : sql`${discussionThreads.title} ilike ${`%${search}%`} escape '\\'`
  : undefined;
 const rows = await db.select({ thread: discussionThreads, cursorAt: sql<string>`to_char(${discussionThreads.lastActivityAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(discussionThreads)
  .where(and(channelFilter, options.status ? eq(discussionThreads.status, options.status) : undefined, searchPredicate, after
  ? or(sql`${discussionThreads.lastActivityAt} < ${after.at}::timestamptz`, and(sql`${discussionThreads.lastActivityAt} = ${after.at}::timestamptz`, lt(discussionThreads.id, after.id))) : undefined))
  .orderBy(desc(discussionThreads.lastActivityAt), desc(discussionThreads.id)).limit(PAGE_SIZE + 1);
 const visible = rows.slice(0, PAGE_SIZE);
 const counts = await threadCounts(actor.id, visible.map(row => row.thread.id));
 const items = visible.map(row => threadDto(actor, row.thread, counts.get(row.thread.id)));
 const last = visible.at(-1);
 return { items, nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor({ at: last.cursorAt, id: last.thread.id }) : null };
}

function safeAiStatusReason(code: string | null, status: string) {
 switch (code) {
  case "DISCUSSION_AI_FREE_TEXT_ONLY": return "ai_freeTextOnly";
  case "DISCUSSION_AI_IMAGE_LIMIT": return "ai_imageLimit";
  case "DISCUSSION_AI_IMAGE_DISABLED": return "ai_imageDisabled";
  case "DISCUSSION_AI_IMAGE_UNAVAILABLE": return "ai_imageUnavailable";
  case "REQUEST_TOO_LARGE": return "ai_requestTooLarge";
  case "DISCUSSION_AI_ASSESSMENT_ACTIVE": return "ai_assessmentActive";
  case "DISCUSSION_AI_QUOTA": return "ai_quota";
  case "DISCUSSION_AI_SOURCE_CHANGED": return "ai_sourceChanged";
  case "DISCUSSION_AI_UNCERTAIN": return "ai_uncertain";
  default: return status === "uncertain" ? "ai_uncertain" : "ai_failed";
 }
}

export async function getThread(actorId: string, threadId: string, cursor?: string, targetMessageId?: string): Promise<{ thread: DiscussionThread; messages: DiscussionPage<DiscussionMessage> & { observationReceipt: string; startCursor?: string; previousCursor?: string }; readThroughSeq: number; aiStatuses: Array<{ messageId: string; status: string; reason: string | null }> }> {
 const actor = await getDiscussionActor(actorId);
 const { channel, thread } = await requireDiscussionThreadAccess(actor, threadId);
 if (targetMessageId !== undefined) checkId(targetMessageId);
 if (cursor && targetMessageId) throw invalid();
 const [target] = targetMessageId ? await db.select({ seq: discussionMessages.seq }).from(discussionMessages)
  .where(and(eq(discussionMessages.threadId, threadId), eq(discussionMessages.id, targetMessageId))).limit(1) : [];
 if (targetMessageId && !target) throw unavailable();
 const after = target ? target.seq - 1 : messageCursor(cursor);
 const [previous, rows] = await Promise.all([
  after > 0 ? db.select({ seq: discussionMessages.seq }).from(discussionMessages)
   .where(and(eq(discussionMessages.threadId, threadId), lte(discussionMessages.seq, after)))
   .orderBy(desc(discussionMessages.seq)).limit(PAGE_SIZE + 1) : [],
  db.select().from(discussionMessages).where(and(eq(discussionMessages.threadId, threadId), gt(discussionMessages.seq, after)))
   .orderBy(asc(discussionMessages.seq)).limit(PAGE_SIZE + 1),
 ]);
 const visible = rows.slice(0, PAGE_SIZE);
 const authors = [...new Set(visible.flatMap(row => [...(row.authorId ? [row.authorId] : []), ...(row.deletedAt ? [] : row.mentionIds)]))];
 const refs = [...new Set(visible.flatMap(row => row.replyToId ? [row.replyToId] : []))];
 const ids = visible.map(row => row.id);
 const ownAttachmentIds = visible.filter(row => !row.deletedAt && !row.forwardedFromId).map(row => row.id);
 const zyraIds = visible.filter(row => row.askZyra).map(row => row.id);
 const [names, replies, reactions, threadMeta, ownAttachments, aiRows] = await Promise.all([
  authors.length ? db.select({ id: user.id, name: user.name, image: user.image, role: peran.code }).from(user)
   .leftJoin(pengguna, and(eq(pengguna.id, user.id), eq(pengguna.status, "active")))
   .leftJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id)).leftJoin(peran, eq(peran.id, penggunaPeran.peranId))
   .where(inArray(user.id, authors)) : [],
  refs.length ? db.select({ id: discussionMessages.id, seq: discussionMessages.seq, kind: discussionMessages.kind,
   name: user.name, body: sql<string>`left(${discussionMessages.body}, 180)`, deletedAt: discussionMessages.deletedAt, forwardedFromId: discussionMessages.forwardedFromId }).from(discussionMessages)
   .leftJoin(user, eq(user.id, discussionMessages.authorId))
   .where(and(eq(discussionMessages.threadId, threadId), inArray(discussionMessages.id, refs))) : [],
  ids.length ? db.select({ messageId: discussionReactions.messageId, emoji: discussionReactions.emoji,
   count: sql<number>`count(*)::int`, selected: sql<boolean>`bool_or(${discussionReactions.userId} = ${actor.id})` })
   .from(discussionReactions).where(inArray(discussionReactions.messageId, ids))
   .groupBy(discussionReactions.messageId, discussionReactions.emoji) : [],
  db.select({
   threadId: discussionThreads.id,
   answerCount: discussionThreads.answerCount,
   unreadCount: sql<number>`(select count(*)::int from discussion_messages m where m.thread_id = ${discussionThreads.id} and m.seq > coalesce(${discussionThreadReads.throughSeq}, 0) and m.deleted_at is null and m.author_id is distinct from ${actor.id})`,
   throughSeq: sql<number>`coalesce(${discussionThreadReads.throughSeq}, 0)::int`,
   observedSeq: sql<number>`coalesce(${discussionThreadReads.observedSeq}, 0)::int`,
  }).from(discussionThreads)
   .leftJoin(discussionThreadReads, and(eq(discussionThreadReads.threadId, discussionThreads.id), eq(discussionThreadReads.userId, actor.id)))
   .where(eq(discussionThreads.id, thread.id)),
  ownAttachmentIds.length
   ? listDiscussionAttachmentsForMessages(actor.id, ownAttachmentIds, new Map(ownAttachmentIds.map(messageId => [messageId, channel.id])))
   : new Map(),
  zyraIds.length ? db.select({ messageId: discussionAiRequests.messageId, status: discussionAiRequests.status, errorCode: discussionAiRequests.errorCode })
   .from(discussionAiRequests)
   .where(and(eq(discussionAiRequests.kind, "zyra"), eq(discussionAiRequests.requestedById, actor.id), inArray(discussionAiRequests.messageId, zyraIds)))
   .limit(PAGE_SIZE) : [],
 ]);
 const sourceIds = [...new Set([...visible.flatMap(row => !row.deletedAt && row.forwardedFromId ? [row.forwardedFromId] : []),
  ...replies.flatMap(row => !row.deletedAt && row.forwardedFromId ? [row.forwardedFromId] : [])])];
 const sources = sourceIds.length ? await db.select({ message: discussionMessages, channel: discussionChannels }).from(discussionMessages)
  .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
  .innerJoin(discussionChannels, eq(discussionChannels.id, discussionThreads.channelId))
  .where(inArray(discussionMessages.id, sourceIds)) : [];
 const authorMap = new Map<string, NonNullable<DiscussionMessage["author"]>>();
 for (const name of names) {
  const existing = authorMap.get(name.id), role = name.role === "murid" ? "student" : name.role;
  const priority = { student: 1, tutor: 2, admin: 3 };
  if (!existing) authorMap.set(name.id, { id: name.id, name: name.name, role: role ?? null, avatarUrl: name.image ?? null });
  else if (role && (!existing.role || priority[role] > priority[existing.role])) existing.role = role;
 }
 const allowedSources = sources.length
  ? new Set((await getAccessibleDiscussionChannels(actor.id, { channelIds: sources.map(row => row.channel.id) })).map(row => row.id))
  : new Set<string>();
 const sourceMap = new Map(sources.filter(row => allowedSources.has(row.channel.id) && !row.message.deletedAt &&
  row.message.messageType !== "forward" && canForwardDiscussion(row.channel, channel)).map(row => [row.message.id, row]));
 const attachmentSources = [...new Set(visible.flatMap(row => !row.deletedAt && row.forwardedFromId && sourceMap.has(row.forwardedFromId) ? [row.forwardedFromId] : []))];
 const attachments = new Map(ownAttachments);
 if (attachmentSources.length) {
  const sourceChannelMap = new Map(attachmentSources.map(sourceId => [sourceId, sourceMap.get(sourceId)!.channel.id]));
  const forwardedAttachments = await listDiscussionAttachmentsForMessages(actor.id, attachmentSources, sourceChannelMap);
  for (const [messageId, items] of forwardedAttachments) attachments.set(messageId, items);
 }
 const items = visible.map(message => {
  let body = message.deletedAt ? "Pesan dihapus." : message.body;
  let forwardedFrom: DiscussionMessage["forwardedFrom"] = null;
  let attachmentMessageId: string | null = message.deletedAt ? null : message.id;
  if (!message.deletedAt && message.forwardedFromId) {
   const source = sourceMap.get(message.forwardedFromId);
   if (source) {
    body = source.message.body;
    forwardedFrom = { id: source.message.id, threadId: source.message.threadId };
    attachmentMessageId = source.message.id;
   } else {
    body = "Pesan asal tidak tersedia."; attachmentMessageId = null;
   }
  }
  const name = message.authorId ? authorMap.get(message.authorId) : null;
  const reply = replies.find(row => row.id === message.replyToId);
  const replySource = reply?.forwardedFromId ? sourceMap.get(reply.forwardedFromId) : null;
  const replyTo: DiscussionMessage["replyTo"] = reply ? { id: reply.id, seq: reply.seq,
   authorKind: reply.deletedAt ? "deleted" : reply.kind === "zyra" || reply.name ? "name" : "unavailable",
   excerptKind: reply.deletedAt ? "deleted" : reply.forwardedFromId && !replySource ? "source_unavailable" : (replySource?.message.body ?? reply.body).trim() ? "body" : "image",
   authorName: reply.deletedAt ? "Pesan dihapus" : reply.kind === "zyra" ? "Zyra" : (reply.name?.slice(0, 80) || "Pengguna tidak tersedia"),
   excerpt: reply.deletedAt ? "Pesan dihapus." : reply.forwardedFromId ? (replySource ? (replySource.message.body.trim().slice(0, 180) || "Gambar") : "Pesan asal tidak tersedia.") : (reply.body.trim() || "Gambar"),
  } : null;
  const actionable = !message.deletedAt && (message.messageType === "forward" ? !!forwardedFrom : !message.forwardedFromId);
  return {
   id: message.id, threadId: message.threadId, seq: message.seq, author: name ?? null,
   mentionedPeople: message.deletedAt ? [] : message.mentionIds.flatMap((id, index) => {
    const person = authorMap.get(id);
    return person?.role ? [{ id, name: person.name, role: person.role, mention: message.mentionHandles?.[index] }] : [];
   }),
   kind: message.kind, messageType: message.messageType, body,
   bodyKind: message.deletedAt ? "deleted" : message.forwardedFromId && !forwardedFrom ? "source_unavailable" : "body",
   createdAt: message.createdAt.toISOString(),
   editedAt: message.editedAt?.toISOString() ?? null, revision: message.revision,
   replyTo, forwardedFrom, skinId: message.deletedAt ? null : message.skinId,
   attachments: attachmentMessageId ? attachments.get(attachmentMessageId) ?? [] : [],
   reactions: message.deletedAt ? [] : reactions.filter(row => row.messageId === message.id).map(row => ({ emoji: row.emoji, count: Number(row.count), selected: row.selected })),
   canEdit: canEditDiscussionMessage(actor, message), canDelete: canDeleteDiscussionMessage(actor, message),
   canReport: !message.deletedAt && message.authorId !== actor.id,
   canReply: actionable && thread.status === "open", canForward: actionable && message.messageType !== "forward", canReact: actionable,
  } satisfies DiscussionMessage;
 });
 const last = visible.at(-1);
 const meta = threadMeta[0];
 const counts = meta ? { answerCount: Number(meta.answerCount), unreadCount: Number(meta.unreadCount) } : undefined;
 const readThroughSeq = Number(meta?.throughSeq ?? 0);
 const currentObservedSeq = Number(meta?.observedSeq ?? 0);
 if (last && last.seq > currentObservedSeq) await db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  await requireDiscussionThreadAccess(current, thread.id, tx);
  await tx.insert(discussionThreadReads).values({ userId: current.id, threadId: thread.id, observedSeq: last.seq }).onConflictDoUpdate({
   target: [discussionThreadReads.userId, discussionThreadReads.threadId],
   set: { observedSeq: sql`greatest(${discussionThreadReads.observedSeq}, ${last.seq})` },
  });
 });
 const observationReceipt = signDiscussionReadReceipt({ userId: actor.id, threadId: thread.id, status: thread.status,
  statusRevision: thread.statusRevision, messages: visible.map(message => ({ id: message.id, seq: message.seq, revision: message.revision })) }, resolveAuthSecret());
 const aiStatuses = aiRows.map(({ messageId, status, errorCode }) => ({
  messageId, status,
  reason: status === "failed" || status === "uncertain" ? safeAiStatusReason(errorCode, status) : null,
 }));
 return { thread: threadDto(actor, thread, counts), messages: { items, nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.seq) : null, observationReceipt, ...(target && after > 0 ? { startCursor: encodeCursor(after) } : {}), ...(previous.length ? { previousCursor: encodeCursor(previous[PAGE_SIZE]?.seq ?? 0) } : {}) }, readThroughSeq, aiStatuses };
}

async function lockRequest(tx: DiscussionTransaction, actorId: string, requestId: string) {
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`discussion:${actorId}:${requestId}`}, 981271))`);
}
async function replay(tx: DiscussionTransaction, actor: DiscussionActor, requestId: string, fingerprint: string) {
 const [message] = await tx.select().from(discussionMessages).where(and(eq(discussionMessages.authorId, actor.id), eq(discussionMessages.requestId, requestId))).limit(1);
 if (!message) return null;
 const { thread, channel } = await requireDiscussionThreadAccess(actor, message.threadId, tx);
 await requireAvailableForward(actor, channel, message, tx);
 if (!message.submissionFingerprint) throw Object.assign(new Error("DISCUSSION_REPLAY_UNVERIFIED"), { threadId: thread.id, messageId: message.id });
 if (message.submissionFingerprint !== fingerprint) throw new Error("DISCUSSION_CONFLICT");
 return { threadId: thread.id, messageId: message.id };
}
async function validateSubmit(tx: DiscussionTransaction, actor: DiscussionActor, channelId: string, input: ReturnType<typeof parseSubmit>) {
 if (input.skinId) {
  const [skin] = await tx.select({ id: gamificationInventory.cosmeticId }).from(gamificationInventory)
   .innerJoin(gamificationCosmetics, eq(gamificationCosmetics.id, gamificationInventory.cosmeticId))
   .where(and(eq(gamificationInventory.userId, actor.id), eq(gamificationInventory.cosmeticId, input.skinId), eq(gamificationCosmetics.slot, "zyra_skin"))).limit(1);
  if (!skin) throw invalid();
 }
 if (input.mentionIds.length) await discussionAccess.requireDiscussionMentionAccess(tx, channelId, input.mentionIds);
}
async function event(tx: DiscussionTransaction, channelId: string, threadId: string, actorId: string,
 kind: typeof discussionEvents.$inferInsert["kind"], participantThroughSeq: number | null, messageId: string | null = null,
 mentions: readonly string[] = [], statusRevision: number | null = null) {
 if (mentions.length > 10 || !mentions.every(validDiscussionId) || new Set(mentions).size !== mentions.length) throw invalid();
 if (kind === "report" ? participantThroughSeq !== null : participantThroughSeq === null || !Number.isSafeInteger(participantThroughSeq) || participantThroughSeq < 0) throw invalid();
 const [message] = messageId && kind !== "report" ? await tx.select({ revision: discussionMessages.revision }).from(discussionMessages)
  .where(and(eq(discussionMessages.id, messageId), eq(discussionMessages.threadId, threadId))).limit(1) : [];
 if (messageId && kind !== "report" && !message) throw invalid();
 const recipientCursor = kind === "question" || kind === "message" || kind === "edit"
  ? JSON.stringify({ phase: "direct", after: null, mentions }) : null;
 wakeOutbox("discussion/notifications.continue");
 await tx.insert(discussionEvents).values({ id: id(), channelId, threadId, messageId, actorId, kind, recipientCursor,
  messageRevision: message?.revision ?? null, statusRevision, participantThroughSeq });
 if (kind !== "report" && kind !== "edit") await tx.update(discussionChannels).set({ countRevision: sql`${discussionChannels.countRevision} + 1` })
  .where(eq(discussionChannels.id, channelId));
}
async function aiRequest(tx: DiscussionTransaction, messageId: string, actorId: string, ask: boolean) {
 if (ask) wakeOutbox("discussion/ai.continue");
 if (ask) await tx.insert(discussionAiRequests).values({ id: id(), messageId, requestedById: actorId, kind: "zyra", requestId: `discussion-zyra:${messageId}` });
}
async function labelRequest(tx: DiscussionTransaction, messageId: string, actorId: string) {
 wakeOutbox("discussion/ai.continue");
 await tx.insert(discussionAiRequests).values({ id: id(), messageId, requestedById: actorId, kind: "label", requestId: `discussion-label:${messageId}` });
}
async function nextSequence(tx: DiscussionTransaction, threadId: string, answer = false) {
 const [thread] = await tx.select().from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1).for("update");
 if (!thread) throw unavailable();
 const seq = thread.nextSeq;
 await tx.update(discussionThreads).set({ nextSeq: seq + 1, lastActivityAt: new Date(),
  answerCount: answer ? sql`${discussionThreads.answerCount} + 1` : undefined }).where(eq(discussionThreads.id, threadId));
 return { thread, seq };
}

async function requireAvailableForward(actor: DiscussionActor, channel: ChannelRow, message: Pick<MessageRow, "messageType" | "forwardedFromId">, tx: DiscussionTransaction) {
 if (message.messageType !== "forward") return;
 if (!message.forwardedFromId) throw unavailable();
 const source = await requireDiscussionMessageAccess(actor, message.forwardedFromId, tx);
 if (source.message.deletedAt || source.message.messageType === "forward" || !canForwardDiscussion(source.channel, channel)) throw unavailable();
}

export async function createThread(actorId: string, raw: CreateDiscussionThread) {
 const actor = await getDiscussionActor(actorId);
 const input = parseSubmit(raw);
 const hasManualTitle = raw.title !== undefined;
 if (hasManualTitle && !validDiscussionText(raw.title, 160)) throw invalid();
 if (raw.helpKind != null || !raw.channelId || "team" in raw) throw invalid();
 const channelId = raw.channelId;
 checkId(channelId);
 const title = hasManualTitle ? raw.title!.trim() : deriveInitialDiscussionTitle(input.body, input.attachmentIds.length > 0);
 await requireDiscussionChannelAccess(actor, channelId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const channel = await requireDiscussionChannelAccess(current, channelId, tx);
  if (channel.kind === "academic" || channel.kind === "technical") throw unavailable();
  await lockRequest(tx, current.id, input.requestId);
  const fingerprint = submissionFingerprint(current.id, input.requestId, ["question", channelId, title, null], input);
  const prior = await replay(tx, current, input.requestId, fingerprint);
  if (prior) return prior;
  await validateSubmit(tx, current, channel.id, input);
  const threadId = id(), messageId = id(), now = new Date();
  await tx.insert(discussionThreads).values({ id: threadId, channelId, authorId: current.id, title, helpKind: null, nextSeq: 2, createdAt: now, lastActivityAt: now });
  await tx.insert(discussionMessages).values({ id: messageId, threadId, authorId: current.id, kind: "human", messageType: "question", body: input.body,
   seq: 1, requestId: input.requestId, submissionFingerprint: fingerprint, mentionIds: input.mentionIds, mentionHandles: input.mentionHandles, askZyra: input.askZyra, skinId: input.skinId, createdAt: now });
  await recordDiscussionParticipant(tx, messageId);
  await attachDiscussionImages(tx, { actorId: current.id, channelId, messageId, attachmentIds: input.attachmentIds });
  if (current.role === "student") await enqueueDiscussionReward(tx, { userId: current.id, threadId, messageId, kind: "question", occurredAt: now });
  await event(tx, channelId, threadId, current.id, "question", 1, messageId, input.mentionIds);
  await aiRequest(tx, messageId, current.id, input.askZyra);
  await labelRequest(tx, messageId, current.id);
  return { threadId, messageId };
 });
}

export async function reply(actorId: string, raw: ReplyToDiscussion) {
 const actor = await getDiscussionActor(actorId), input = parseSubmit(raw);
 checkId(raw.threadId);
 if (!validDiscussionReplyType(raw.messageType, raw.replyTo)) throw invalid();
 await requireDiscussionThreadAccess(actor, raw.threadId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel } = await requireDiscussionThreadAccess(current, raw.threadId, tx);
  await lockRequest(tx, current.id, input.requestId);
  const type = raw.messageType;
  const fingerprint = submissionFingerprint(current.id, input.requestId, [type, raw.threadId, raw.replyTo ?? null], input);
  const prior = await replay(tx, current, input.requestId, fingerprint);
  if (prior) return prior;
  const { thread, seq } = await nextSequence(tx, raw.threadId, type === "answer");
  if (thread.status !== "open") throw new Error("DISCUSSION_RESOLVED");
  if (raw.replyTo) {
   const [parent] = await tx.select().from(discussionMessages).where(and(eq(discussionMessages.id, raw.replyTo),
    eq(discussionMessages.threadId, thread.id), isNull(discussionMessages.deletedAt))).limit(1);
   if (!parent) throw unavailable();
   await requireAvailableForward(current, channel, parent, tx);
  }
  await validateSubmit(tx, current, channel.id, input);
  const messageId = id(), now = new Date();
  await tx.insert(discussionMessages).values({ id: messageId, threadId: thread.id, authorId: current.id, kind: "human", messageType: type, body: input.body,
   seq, requestId: input.requestId, submissionFingerprint: fingerprint, replyToId: raw.replyTo ?? null, mentionIds: input.mentionIds, mentionHandles: input.mentionHandles, askZyra: input.askZyra, skinId: input.skinId, createdAt: now });
  await recordDiscussionParticipant(tx, messageId);
  await attachDiscussionImages(tx, { actorId: current.id, channelId: channel.id, messageId, attachmentIds: input.attachmentIds });
  if (type === "answer" && current.role === "student" && thread.authorId !== current.id)
   await enqueueDiscussionReward(tx, { userId: current.id, threadId: thread.id, messageId, kind: "answer", occurredAt: now });
  await event(tx, channel.id, thread.id, current.id, "message", seq, messageId, input.mentionIds);
  await aiRequest(tx, messageId, current.id, input.askZyra);
  return { threadId: thread.id, messageId };
 });
}

export async function edit(actorId: string, messageId: string, body: string, revision: number) {
 const actor = await getDiscussionActor(actorId);
 checkId(messageId);
 if (typeof body !== "string" || body.length > 12000 || body.includes("\0") || !Number.isSafeInteger(revision) || revision < 1) throw invalid();
 await requireDiscussionMessageAccess(actor, messageId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel, thread: accessibleThread } = await requireDiscussionMessageAccess(current, messageId, tx);
  const [thread] = await tx.select().from(discussionThreads).where(eq(discussionThreads.id, accessibleThread.id)).limit(1).for("update");
  if (!thread) throw unavailable();
  const [message] = await tx.select().from(discussionMessages).where(eq(discussionMessages.id, messageId)).limit(1).for("update");
  if (!message || !canEditDiscussionMessage(current, message)) throw unavailable();
  if (!body.trim()) {
   const [attachment] = await tx.select({ id: discussionAttachments.id }).from(discussionAttachments).where(eq(discussionAttachments.messageId, messageId)).limit(1);
   if (!attachment) throw invalid();
  }
  const [updated] = await tx.update(discussionMessages).set({ body: body.trim(), revision: sql`${discussionMessages.revision} + 1`, editedAt: new Date(), mentionIds: [], mentionHandles: null })
   .where(and(eq(discussionMessages.id, messageId), eq(discussionMessages.revision, revision), isNull(discussionMessages.deletedAt), current.role === "admin" ? undefined
    : sql`${discussionMessages.createdAt} <= now() and ${discussionMessages.createdAt} > now() - interval '5 minutes'`)).returning({ revision: discussionMessages.revision });
  if (!updated) throw new Error("DISCUSSION_CONFLICT");
  await event(tx, channel.id, thread.id, current.id, "edit", thread.nextSeq - 1, messageId, message.mentionIds);
  return updated;
 });
}

export async function deleteMessage(actorId: string, messageId: string) {
 const actor = await getDiscussionActor(actorId);
 checkId(messageId);
 await requireDiscussionMessageAccess(actor, messageId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel, thread: accessibleThread } = await requireDiscussionMessageAccess(current, messageId, tx);
  const [thread] = await tx.select().from(discussionThreads).where(eq(discussionThreads.id, accessibleThread.id)).limit(1).for("update");
  if (!thread) throw unavailable();
  // Keep reply foreign-key key-share locks compatible while serializing soft-deletes.
  const [message] = await tx.select().from(discussionMessages).where(eq(discussionMessages.id, messageId)).limit(1).for("no key update");
  if (!message || !canDeleteDiscussionMessage(current, message)) throw unavailable();
  await tx.update(discussionMessages).set({ deletedAt: new Date(), deletedById: current.id, revision: sql`${discussionMessages.revision} + 1` }).where(eq(discussionMessages.id, messageId));
  if (message.messageType === "answer") await tx.update(discussionThreads).set({ answerCount: sql`${discussionThreads.answerCount} - 1` }).where(eq(discussionThreads.id, thread.id));
  await event(tx, channel.id, thread.id, current.id, "delete", thread.nextSeq - 1, messageId);
 });
}

export async function forward(actorId: string, messageId: string, threadId: string, requestId: string) {
 const actor = await getDiscussionActor(actorId);
 checkId(messageId); checkId(threadId); checkId(requestId);
 await requireDiscussionMessageAccess(actor, messageId);
 await requireDiscussionThreadAccess(actor, threadId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const source = await requireDiscussionMessageAccess(current, messageId, tx);
  const destination = await requireDiscussionThreadAccess(current, threadId, tx);
  if (source.message.deletedAt || source.message.messageType === "forward" || !canForwardDiscussion(source.channel, destination.channel)) throw unavailable();
  await lockRequest(tx, current.id, requestId);
  const fingerprint = submissionFingerprint(current.id, requestId, ["forward", threadId, messageId]);
  const prior = await replay(tx, current, requestId, fingerprint);
  if (prior) return prior;
  const { thread, seq } = await nextSequence(tx, threadId);
  if (thread.status !== "open") throw new Error("DISCUSSION_RESOLVED");
  const newId = id();
  await tx.insert(discussionMessages).values({ id: newId, threadId, authorId: current.id, kind: "human", messageType: "forward", body: "", seq, requestId, submissionFingerprint: fingerprint, forwardedFromId: messageId });
  await recordDiscussionParticipant(tx, newId);
  await event(tx, destination.channel.id, threadId, current.id, "message", seq, newId);
  return { threadId, messageId: newId };
 });
}

export async function setReaction(actorId: string, messageId: string, emoji: string, selected: boolean) {
 const actor = await getDiscussionActor(actorId);
 checkId(messageId);
 if (!DISCUSSION_REACTIONS.includes(emoji as typeof DISCUSSION_REACTIONS[number]) || typeof selected !== "boolean") throw invalid();
 await requireDiscussionMessageAccess(actor, messageId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel, message } = await requireDiscussionMessageAccess(current, messageId, tx);
  if (message.deletedAt) throw unavailable();
  await requireAvailableForward(current, channel, message, tx);
  if (selected) await tx.insert(discussionReactions).values({ messageId, userId: current.id, emoji }).onConflictDoNothing();
  else await tx.delete(discussionReactions).where(and(eq(discussionReactions.messageId, messageId), eq(discussionReactions.userId, current.id), eq(discussionReactions.emoji, emoji)));
 });
}

export async function markRead(actorId: string, threadId: string, throughSeq: number, observationReceipt: string, messageIds: string[]) {
 const actor = await getDiscussionActor(actorId);
 checkId(threadId);
 if (!Number.isSafeInteger(throughSeq) || throughSeq < 0) throw invalid();
 const receipt = verifyDiscussionReadReceipt(observationReceipt, actor.id, threadId, resolveAuthSecret());
 if (!receipt || !Array.isArray(messageIds) || messageIds.length > PAGE_SIZE || new Set(messageIds).size !== messageIds.length) throw invalid();
 const selected = receipt.messages.filter(message => messageIds.includes(message.id));
 if (selected.length !== messageIds.length) throw invalid();
 await requireDiscussionThreadAccess(actor, threadId);
 await admit(actor.id, "read");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel } = await requireDiscussionThreadAccess(current, threadId, tx);
  await tx.select({ id: discussionThreads.id }).from(discussionThreads).where(eq(discussionThreads.id, threadId)).for("update");
  const [observed] = await tx.select({ seq: discussionThreadReads.observedSeq, throughSeq: discussionThreadReads.throughSeq }).from(discussionThreadReads)
   .where(and(eq(discussionThreadReads.userId, current.id), eq(discussionThreadReads.threadId, threadId))).limit(1);
  if (throughSeq > (observed?.seq ?? 0)) throw invalid();
  if (selected.length) await tx.insert(discussionMessageObservations).values(selected.map(message => ({ userId: current.id, messageId: message.id, revision: message.revision })))
   .onConflictDoUpdate({ target: [discussionMessageObservations.messageId, discussionMessageObservations.userId],
    set: { revision: sql`greatest(${discussionMessageObservations.revision}, excluded.revision)` } });
  if (throughSeq > (observed?.throughSeq ?? 0)) {
   const [missing] = await tx.select({ id: discussionMessages.id }).from(discussionMessages)
    .leftJoin(discussionMessageObservations, and(eq(discussionMessageObservations.messageId, discussionMessages.id), eq(discussionMessageObservations.userId, current.id)))
    .where(and(eq(discussionMessages.threadId, threadId), gt(discussionMessages.seq, observed?.throughSeq ?? 0),
     lte(discussionMessages.seq, throughSeq), isNull(discussionMessageObservations.messageId))).limit(1);
   if (missing) throw invalid();
  }
  const [read] = await tx.insert(discussionThreadReads).values({ userId: current.id, threadId, throughSeq, observedSeq: observed?.seq ?? 0, seenStatusRevision: receipt.statusRevision }).onConflictDoUpdate({
   target: [discussionThreadReads.userId, discussionThreadReads.threadId],
   set: { throughSeq: sql`greatest(${discussionThreadReads.throughSeq}, ${throughSeq})`,
    seenStatusRevision: sql`greatest(coalesce(${discussionThreadReads.seenStatusRevision}, -1), ${receipt.statusRevision})`, updatedAt: new Date() },
  }).returning({ throughSeq: discussionThreadReads.throughSeq });
  if (read.throughSeq > (observed?.throughSeq ?? 0)) {
   // Only the transition to no unread messages changes the aggregate.
   const [changed] = await tx.select({ unread: sql<boolean>`exists (select 1 from ${discussionMessages} m where m.thread_id = ${threadId}
    and m.seq > ${observed?.throughSeq ?? 0} and m.seq <= ${read.throughSeq} and m.deleted_at is null and m.author_id is distinct from ${current.id})
    and not exists (select 1 from ${discussionMessages} m where m.thread_id = ${threadId}
    and m.seq > ${read.throughSeq} and m.deleted_at is null and m.author_id is distinct from ${current.id})` })
    .from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1);
   if (!changed) throw unavailable();
   if (changed.unread) await tx.insert(discussionChannelPreferences).values({ userId: current.id, channelId: channel.id, readRevision: 1n }).onConflictDoUpdate({
    target: [discussionChannelPreferences.userId, discussionChannelPreferences.channelId],
    set: { readRevision: sql`${discussionChannelPreferences.readRevision} + 1` },
   });
  }
  await clearDiscussionNotificationsThroughSeq(tx, { userId: current.id, threadId, throughSeq: read.throughSeq });
  return read;
 });
}

export async function setMute(actorId: string, channelId: string, muted: boolean) {
 const actor = await getDiscussionActor(actorId);
 checkId(channelId);
 if (typeof muted !== "boolean") throw invalid();
 await requireDiscussionChannelAccess(actor, channelId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  await requireDiscussionChannelAccess(current, channelId, tx);
  await tx.insert(discussionChannelPreferences).values({ userId: current.id, channelId, muted }).onConflictDoUpdate({
   target: [discussionChannelPreferences.userId, discussionChannelPreferences.channelId], set: { muted, updatedAt: new Date() },
  });
 });
}

export async function setResolved(actorId: string, threadId: string, resolved: boolean) {
 const actor = await getDiscussionActor(actorId);
 checkId(threadId);
 if (typeof resolved !== "boolean") throw invalid();
 await requireDiscussionThreadAccess(actor, threadId);
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel } = await requireDiscussionThreadAccess(current, threadId, tx);
  const [thread] = await tx.select().from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1).for("update");
  if (!thread || (current.role !== "admin" && thread.authorId !== current.id)) throw unavailable();
  const status = resolved ? "resolved" : "open";
  if (thread.status !== status) {
   const statusRevision = thread.statusRevision + 1;
   await tx.update(discussionThreads).set({ status, statusRevision, lastActivityAt: new Date() }).where(eq(discussionThreads.id, threadId));
   await event(tx, channel.id, threadId, current.id, "resolved", thread.nextSeq - 1, null, [], statusRevision);
  }
  return { status };
 });
}

export async function searchChannelMentions(actorId: string, channelId: string, query: string) {
 const actor = await getDiscussionActor(actorId);
 checkId(channelId);
 if (typeof query !== "string" || query.length > 80 || /[\u0000-\u001f]/.test(query)) return [];
 const channel = await requireDiscussionChannelAccess(actor, channelId);
 const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
 const role = (code: string) => sql`exists (select 1 from ${penggunaPeran} membership join ${peran} role on role.id = membership.peran_id where membership.pengguna_id = ${user.id} and role.code = ${code})`;
 const admin = role("admin"), tutor = role("tutor"), student = role("murid");
 const assignment = channel.courseId ? sql`(exists (select 1 from ${penugasanTutor} assignment where assignment.pengguna_id = ${user.id} and assignment.mata_kuliah_id = ${channel.courseId} and assignment.status = 'active' and assignment.assignment_scope = 'course')
  or (not exists (select 1 from ${penugasanTutor} assignment where assignment.pengguna_id = ${user.id} and assignment.mata_kuliah_id = ${channel.courseId})
   and exists (select 1 from ${tutorCourses} assignment where assignment.tutor_id = ${user.id} and assignment.course_id = ${channel.legacyCourseId})))` : sql`false`;
 const enrollment = sql`(exists (select 1 from ${pendaftaranMurid} enrollment where enrollment.pengguna_id = ${user.id} and enrollment.mata_kuliah_id = ${channel.courseId}
   and enrollment.status in ('active', 'completed') and (enrollment.end_at is null or enrollment.end_at > now()))
  or exists (select 1 from ${enrollments} enrollment where enrollment.user_id = ${user.id} and enrollment.course_id = ${channel.legacyCourseId ?? channel.courseId} and enrollment.expires_at > now()))`;
 const free = channel.courseId ? sql`exists (select 1 from ${mataKuliah} course where course.id = ${channel.courseId} and course.status = 'active' and
  (course.pricing_category = 'free' or (course.pricing_category = 'limited_time_free' and course.free_starts_at <= now() and now() < course.free_ends_at)))` : sql`false`;
 const courseAudience = channel.courseId || channel.legacyCourseId
  ? sql`(${admin} or (${tutor} and ${assignment}) or (not ${tutor} and ${student} and (${enrollment} or ${free})))` : sql`(${admin} or ${tutor} or ${student})`;
 const pkaAudience = channel.courseId === PKA_COURSE_ID || channel.legacyCourseId === PKA_COURSE_ID
  ? sql`(${admin} or ${tutor} or exists (select 1 from ${enrollments} registration where registration.user_id = ${user.id} and registration.course_id = ${PKA_COURSE_ID}))` : undefined;
 const rows = await db.select({ id: user.id, name: user.name, image: user.image }).from(user).innerJoin(pengguna, eq(pengguna.id, user.id))
  .where(and(eq(pengguna.status, "active"), courseAudience, pkaAudience,
   sql`${nameSearchBigrams(user.name)} @> array(select distinct pair from unnest(${nameSearchBigrams(sql`${query.trim()}`)}) as terms(pair) where char_length(pair) = 2)`,
   sql`${user.name} ilike ${pattern} escape '\\'`)).orderBy(asc(user.name), asc(user.id)).limit(101);
 const candidates = rows.slice(0, 100);
 const access = await getDiscussionRecipientAccess(channel.id, candidates.map(row => row.id));
 const eligible = candidates.flatMap(row => {
  const candidate = access.get(row.id);
  return candidate ? [{ id: row.id, name: row.name, ...(row.image ? { avatarUrl: row.image } : {}), role: candidate.role }] : [];
 });
 const page = eligible;
 const sameNameAndRole = (a: typeof eligible[number], b: typeof eligible[number]) =>
  a.id !== b.id && a.role === b.role && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
 const visibleDuplicates = page.filter(person => eligible.some(other => sameNameAndRole(person, other)));
 const duplicates = eligible.filter(person => visibleDuplicates.some(other => person.id === other.id || sameNameAndRole(person, other)));
 const contexts = duplicates.length ? (await db.execute<{ id: string; body: string }>(sql`
  select candidate.id, m.body
  from jsonb_array_elements_text(${JSON.stringify(duplicates.map(person => person.id))}::jsonb) as candidate(id)
  cross join lateral (
   select p.thread_id, p.first_seq from ${discussionThreadParticipants} p
   where p.channel_id = ${channel.id} and p.user_id = candidate.id order by p.thread_id limit 1
  ) participant
  join ${discussionThreads} t on t.id = participant.thread_id and t.channel_id = ${channel.id}
  cross join lateral (
   select left(message.body, 100) as body, message.author_id, message.kind, message.deleted_at, message.message_type
   from ${discussionMessages} message
   where message.thread_id = participant.thread_id and message.seq = participant.first_seq
   limit 1
  ) m
  where m.author_id = candidate.id and m.kind = 'human' and m.deleted_at is null and m.message_type <> 'forward' and length(trim(m.body)) > 0
 `)).rows : [];
 const currentChannel = await requireDiscussionChannelAccess(actor, channel.id);
 if (currentChannel.kind !== channel.kind || currentChannel.requesterId !== channel.requesterId ||
  currentChannel.courseId !== channel.courseId || currentChannel.legacyCourseId !== channel.legacyCourseId) throw unavailable();
 const byAuthor = new Map(contexts.map(row => [row.id, row.body]));
 const normalizedContext = (id: string) => (byAuthor.get(id) ?? "").trim().replace(/\s+/g, " ").toLowerCase();
 // shortcut: overflow cannot prove uniqueness, increase the bound only with a paged collision check.
 return page.map(person => {
  const namesakes = eligible.filter(other => sameNameAndRole(person, other));
  const ambiguous = rows.length > 100 || namesakes.some(other => normalizedContext(other.id) === normalizedContext(person.id));
  return { ...person, ...(namesakes.length ? { hasNamesake: true, ...(byAuthor.has(person.id) ? { context: byAuthor.get(person.id)! } : {}) } : {}),
   ...(ambiguous ? { ambiguous: true } : {}) };
 });
}

export async function searchMentions(actorId: string, threadId: string, query: string) {
 const actor = await getDiscussionActor(actorId);
 const { channel } = await requireDiscussionThreadAccess(actor, threadId);
 return searchChannelMentions(actor.id, channel.id, query);
}

export async function report(actorId: string, messageId: string, reason: string) {
 const actor = await getDiscussionActor(actorId);
 checkId(messageId);
 if (!validDiscussionText(reason, 1000)) throw invalid();
 await requireDiscussionMessageAccess(actor, messageId);
 await admit(actor.id, "report");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  const { channel, thread, message } = await requireDiscussionMessageAccess(current, messageId, tx);
  if (message.deletedAt || message.authorId === current.id) throw unavailable();
  const [inserted] = await tx.insert(discussionReports).values({ id: id(), messageId, reporterId: current.id, reason: reason.trim() })
   .onConflictDoNothing().returning({ id: discussionReports.id });
  if (inserted) {
   await event(tx, channel.id, thread.id, current.id, "report", null, messageId);
   return inserted;
  }
  const [existing] = await tx.select({ id: discussionReports.id }).from(discussionReports).where(and(eq(discussionReports.messageId, messageId),
   eq(discussionReports.reporterId, current.id), eq(discussionReports.status, "pending"))).limit(1);
  if (!existing) throw new Error("DISCUSSION_CONFLICT");
  return existing;
 });
}

export async function listReports(actorId: string, cursor?: string): Promise<DiscussionPage<DiscussionReport>> {
 const actor = await getDiscussionActor(actorId);
 if (actor.role !== "admin") throw unavailable();
 const after = pageCursor(cursor);
 const { predicate } = await getDiscussionChannelVisibility(actor.id, { discoveryScope: discussionAccess.discussionChannelsWithPendingReports() });
 const rows = await db.select({ report: discussionReports, cursorAt: sql<string>`to_char(${discussionReports.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, reporter: { id: user.id, name: user.name },
  message: discussionMessages, thread: discussionThreads, channel: discussionChannels }).from(discussionReports)
  .innerJoin(user, eq(user.id, discussionReports.reporterId))
  .innerJoin(discussionMessages, eq(discussionMessages.id, discussionReports.messageId))
  .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
  .innerJoin(discussionChannels, eq(discussionChannels.id, discussionThreads.channelId))
  .where(and(predicate, eq(discussionReports.status, "pending"), after
   ? or(sql`${discussionReports.createdAt} < ${after.at}::timestamptz`, and(sql`${discussionReports.createdAt} = ${after.at}::timestamptz`, lt(discussionReports.id, after.id))) : undefined))
  .orderBy(desc(discussionReports.createdAt), desc(discussionReports.id)).limit(PAGE_SIZE + 1);
 const visible = rows.slice(0, PAGE_SIZE);
 if ((await getDiscussionActor(actor.id)).role !== "admin") throw unavailable();
 const currentChannels = new Map((visible.length ? await getAccessibleDiscussionChannels(actor.id,
  { channelIds: visible.map(row => row.channel.id) }) : []).map(channel => [channel.id, channel]));
 const authorized = visible.flatMap(row => {
  const channel = currentChannels.get(row.channel.id);
  return channel ? [{ ...row, channel }] : [];
 });
 const authorIds = [...new Set(authorized.flatMap(row => !row.message.deletedAt && row.message.authorId ? [row.message.authorId] : []))];
 const sourceIds = [...new Set(authorized.flatMap(row => !row.message.deletedAt && row.message.forwardedFromId ? [row.message.forwardedFromId] : []))];
 const [authors, sources] = await Promise.all([
  authorIds.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, authorIds)) : [],
  sourceIds.length ? db.select({ id: discussionMessages.id, body: sql<string>`left(${discussionMessages.body}, 2000)`,
   deletedAt: discussionMessages.deletedAt, messageType: discussionMessages.messageType, channel: discussionChannels }).from(discussionMessages)
   .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
   .innerJoin(discussionChannels, eq(discussionChannels.id, discussionThreads.channelId)).where(inArray(discussionMessages.id, sourceIds)) : [],
 ]);
 const allowedSources = new Set((sources.length ? await getAccessibleDiscussionChannels(actor.id, { channelIds: sources.map(source => source.channel.id) }) : []).map(channel => channel.id));
 const items: DiscussionReport[] = authorized.map(({ report, reporter, channel, thread, message }) => {
  const source = message.forwardedFromId ? sources.find(item => item.id === message.forwardedFromId) : undefined;
  const sourceAllowed = source && allowedSources.has(source.channel.id) && !source.deletedAt && source.messageType !== "forward" && canForwardDiscussion(source.channel, channel);
  const author = authors.find(author => author.id === message.authorId);
  const bodyKind: NonNullable<DiscussionReport["message"]["bodyKind"]> = message.deletedAt ? "deleted"
   : message.messageType === "forward" && !sourceAllowed ? "source_unavailable"
   : (message.messageType === "forward" ? source!.body : message.body).trim() ? "body" : "image";
  const authorKind: NonNullable<DiscussionReport["message"]["authorKind"]> = message.deletedAt ? "deleted"
   : message.kind === "zyra" || author?.name ? "name" : "unavailable";
  const body = message.deletedAt ? "Pesan dihapus." : message.messageType === "forward"
   ? source && sourceAllowed ? source.body.trim().slice(0, 2000) || "Gambar" : "Pesan asal tidak tersedia."
   : message.body.trim().slice(0, 2000) || "Gambar";
  const authorName = message.deletedAt ? "Pesan dihapus" : message.kind === "zyra" ? "Zyra"
   : author?.name.slice(0, 80) || "Pengguna tidak tersedia";
  return { id: report.id, messageId: report.messageId, threadId: thread.id, threadTitle: thread.title.slice(0, 160), reason: report.reason,
   status: report.status, createdAt: report.createdAt.toISOString(), reporter,
   message: { body, seq: message.seq, deleted: !!message.deletedAt, authorName, bodyKind, authorKind } };
 });
 const last = visible.at(-1);
 return { items, nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor({ at: last.cursorAt, id: last.report.id }) : null };
}

export async function resolveReport(actorId: string, reportId: string, resolution: "resolved" | "dismissed") {
 const actor = await getDiscussionActor(actorId);
 checkId(reportId);
 if (actor.role !== "admin") throw unavailable();
 if (resolution !== "resolved" && resolution !== "dismissed") throw invalid();
 await admit(actor.id, "write");
 return db.transaction(async tx => {
  const current = await getDiscussionActor(actor.id, tx);
  if (current.role !== "admin") throw unavailable();
  const [item] = await tx.select().from(discussionReports).where(eq(discussionReports.id, reportId)).limit(1).for("update");
  if (!item) throw unavailable();
  await requireDiscussionMessageAccess(current, item.messageId, tx);
  if (item.status === "pending") await tx.update(discussionReports).set({ status: resolution, resolvedAt: new Date(), resolvedById: current.id }).where(eq(discussionReports.id, reportId));
  else if (item.status !== resolution) throw new Error("DISCUSSION_CONFLICT");
  return { status: resolution };
 });
}

export async function getDiscussionAuthorProfile(actorId: string, threadId: string, authorId: string): Promise<DiscussionAuthorProfile> {
 const actor = await getDiscussionActor(actorId);
 checkId(threadId);
 checkId(authorId);
 await requireDiscussionThreadAccess(actor, threadId);
 const [authored] = await db.select({ id: discussionMessages.id })
  .from(discussionMessages)
  .where(and(
   eq(discussionMessages.threadId, threadId),
   or(eq(discussionMessages.authorId, authorId), sql`${discussionMessages.mentionIds} @> ${JSON.stringify([authorId])}::jsonb`),
   eq(discussionMessages.kind, "human"),
   isNull(discussionMessages.deletedAt),
  ))
  .limit(1);
 if (!authored) throw unavailable();
 const result = await db.execute<{
  id: string;
  name: string;
  image: string | null;
  is_student: boolean;
  is_staff: boolean;
  top_role: "admin" | "tutor" | "murid" | null;
  is_blocked: boolean;
  is_self: boolean;
  public_id: string | null;
  display_name: string | null;
  visibility: string | null;
  rank_key: string | null;
  base_xp_micro: number | null;
  earned_badges: { family: string; tier: number }[] | null;
  featured_badge_ids: string[] | null;
  equipped_frame_id: string | null;
  equipped_theme_id: string | null;
  equipped_title_id: string | null;
  equipped_zyra_avatar_id: string | null;
  major: string | null;
  faculty: string | null;
  follower_count: number | null;
  following_count: number | null;
  allow_follows: boolean | null;
  is_following: boolean | null;
 }>(sql`
  select
   u.id,
   u.name,
   u.image,
   ${eligibleStudent(sql.raw("u"))} as is_student,
   exists (
    select 1 from pengguna_peran pp
    join peran r on r.id = pp.peran_id
    where pp.pengguna_id = u.id and r.code in ('admin', 'tutor')
   ) as is_staff,
   (
    select r.code from pengguna_peran pp
    join peran r on r.id = pp.peran_id
    where pp.pengguna_id = u.id
    order by case r.code when 'admin' then 1 when 'tutor' then 2 when 'murid' then 3 else 4 end
    limit 1
   ) as top_role,
   not ${noBlock(actor.id, sql.raw("u.id"))} as is_blocked,
   u.id = ${actor.id} as is_self,
   p.public_id,
   coalesce(p.display_name, u.name) as display_name,
   coalesce(p.visibility, 'members') as visibility,
   coalesce(a.rank_key, 'rakyat') as rank_key,
   case when p.leaderboard_opt_in then coalesce(a.base_xp_micro, 0) end as base_xp_micro,
   coalesce((
    select jsonb_agg(jsonb_build_object('family', b.family, 'tier', b.tier) order by b.family)
    from gamification_badges b
    where b.user_id = u.id and b.tier > 0
   ), '[]'::jsonb) as earned_badges,
   coalesce(p.featured_badge_ids, '[]'::jsonb) as featured_badge_ids,
   p.equipped_frame_id,
   p.equipped_theme_id,
   p.equipped_title_id,
   case when exists (
    select 1 from gamification_inventory i
    join gamification_cosmetics c on c.id = i.cosmetic_id
    where i.user_id = u.id and i.cosmetic_id = p.equipped_zyra_avatar_id and c.slot = 'zyra_avatar'
   ) then p.equipped_zyra_avatar_id end as equipped_zyra_avatar_id,
   case when p.show_major then u.major end as major,
   case when p.show_faculty then u.faculty end as faculty,
   coalesce(p.follower_count, 0) as follower_count,
   coalesce(p.following_count, 0) as following_count,
   coalesce(p.allow_follows, false) as allow_follows,
   case when ${actor.role === "student"} then exists (
    select 1 from gamification_follows f where f.follower_id = ${actor.id} and f.following_id = u.id
   ) else false end as is_following
  from "user" u
  left join gamification_profiles p on p.user_id = u.id
  left join gamification_accounts a on a.user_id = u.id
  where u.id = ${authorId}
  limit 1
 `);
 const row = result.rows[0];
 if (!row) {
  return { kind: "limited", id: authorId, name: "Pengguna tidak tersedia", role: null, avatarUrl: null, visibilityReason: "unavailable" };
 }
 const mappedRole: DiscussionRole | null = row.top_role === "admin" ? "admin" : row.top_role === "tutor" ? "tutor" : row.top_role === "murid" ? "student" : null;
 if (row.is_blocked) {
  return { kind: "limited", id: row.id, name: row.name, role: mappedRole, avatarUrl: null, visibilityReason: "blocked" };
 }
 if (row.is_staff || !row.is_student) {
  return { kind: "limited", id: row.id, name: row.name, role: mappedRole, avatarUrl: row.image ?? null, visibilityReason: "staff" };
 }
 if (!row.is_self && row.visibility !== "members") {
  return { kind: "limited", id: row.id, name: row.display_name ?? row.name, role: "student", avatarUrl: row.image ?? null, visibilityReason: "private" };
 }
 const profile: DiscussionStudentProfile = {
  publicId: row.public_id,
  displayName: row.display_name ?? row.name,
  avatarUrl: row.image ?? null,
  avatarBadgeId: null,
  avatarMode: "photo",
  avatarBadgeTier: null,
  rankKey: row.rank_key ?? "rakyat",
  baseXpMicro: row.base_xp_micro == null ? null : Number(row.base_xp_micro),
  earnedBadges: Array.isArray(row.earned_badges) ? row.earned_badges.map(badge => ({ family: badge.family, tier: Number(badge.tier) })) : [],
  featuredBadgeIds: Array.isArray(row.featured_badge_ids) ? row.featured_badge_ids : [],
  equippedFrameId: row.equipped_frame_id ?? null,
  equippedThemeId: row.equipped_theme_id ?? null,
  equippedTitleId: row.equipped_title_id ?? null,
  equippedZyraAvatarId: row.equipped_zyra_avatar_id ?? null,
  major: row.major ?? null,
  faculty: row.faculty ?? null,
  followerCount: Number(row.follower_count ?? 0),
  followingCount: Number(row.following_count ?? 0),
  canFollow: Boolean(actor.role === "student" && !row.is_self && row.allow_follows && row.public_id),
  isFollowing: Boolean(actor.role === "student" && row.is_following),
 };
 return { kind: "student", name: profile.displayName, role: "student", profile };
}

export { publishDiscussionZyraAnswer } from "./ai-publication";
