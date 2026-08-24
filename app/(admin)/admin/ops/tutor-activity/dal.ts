import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, courses, mataKuliah, pengguna, penggunaPeran, peran, user } from "@/db/schema";
import { sanitizeSnapshot } from "@/lib/audit/mutasi";
import { daysFrom, normalizeDate, parseDateInput, startOfDay } from "@/lib/date-utils";

export type TutorActivityOutcomeFilter =
  | "all"
  | "success"
  | "rejected"
  | "failed"
  | "unclassified";

export interface TutorActivityCursor {
  createdAt: string | number | Date;
  id: string;
}

export interface TutorActivityFilterInput {
  actorId?: string;
  courseId?: string;
  entityType?: string;
  action?: string;
  outcome?: TutorActivityOutcomeFilter;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  cursor?: TutorActivityCursor | null;
  limit?: number;
}

export interface TutorActivityItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorImage: string | null;
  entityType: string;
  entityId: string;
  action: string;
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  outcome: "success" | "rejected" | "failed" | "unclassified";
  reason: string | null;
  correlationId: string | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: Date;
}

export interface TutorActivityStats {
  total: number;
  success: number;
  rejected: number;
  failed: number;
  unclassified: number;
}

export interface TutorActivityQueryResult {
  items: TutorActivityItem[];
  nextCursor: {
    createdAt: string;
    id: string;
  } | null;
  hasNextPage: boolean;
  limit: number;
}

export interface TutorOption {
  id: string;
  name: string;
  email: string;
}

export interface CourseOption {
  id: string;
  code: string | null;
  title: string;
}

export interface TutorActivityFilterOptions {
  tutors: TutorOption[];
  courses: CourseOption[];
  entityTypes: string[];
  actions: string[];
}

export function clampPageSize(limit?: number): number {
  if (limit === 50) return 50;
  if (limit === 100) return 100;
  return 25;
}

export function sanitizeSnapshotSafely(
  snapshot: unknown,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const sanitized = sanitizeSnapshot(snapshot);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return null;
}

export function validateCursor(
  cursor: unknown,
): { createdAt: Date; id: string } | null {
  if (!cursor || typeof cursor !== "object") return null;
  const c = cursor as Record<string, unknown>;

  if (typeof c.id !== "string") return null;
  const trimmedId = c.id.trim();
  if (trimmedId.length === 0 || trimmedId.length > 256) return null;

  if (c.createdAt === null || c.createdAt === undefined) return null;

  let date: Date;
  if (c.createdAt instanceof Date) {
    date = c.createdAt;
  } else if (typeof c.createdAt === "number") {
    date = new Date(c.createdAt);
  } else if (typeof c.createdAt === "string") {
    date = new Date(c.createdAt.trim());
  } else {
    return null;
  }

  const time = date.getTime();
  if (Number.isNaN(time)) return null;

  // Bound: between epoch (1970-01-01) and year 2099
  const minTime = 0;
  const maxTime = 4102444800000;
  if (time < minTime || time > maxTime) return null;

  return {
    createdAt: date,
    id: trimmedId,
  };
}

export function buildTutorScopeCondition(): SQL {
  return or(
    sql`${auditMutasi.actorId} IN (
      SELECT ${penggunaPeran.penggunaId}
      FROM ${penggunaPeran}
      INNER JOIN ${peran} ON ${penggunaPeran.peranId} = ${peran.id}
      WHERE ${peran.code} = 'tutor'
    )`,
    sql`json_extract(${auditMutasi.afterSnapshot}, '$.actorRoles') LIKE '%"tutor"%'`,
    sql`json_extract(${auditMutasi.beforeSnapshot}, '$.actorRoles') LIKE '%"tutor"%'`,
    sql`${auditMutasi.action} LIKE 'tutor:%'`,
    sql`${auditMutasi.action} LIKE 'workflow:tutor%'`,
  )!;
}

async function resolveCourseMap(
  client: any,
  rawCourseIds: string[],
): Promise<Map<string, { title: string; code: string | null }>> {
  const courseMap = new Map<string, { title: string; code: string | null }>();
  if (rawCourseIds.length === 0) return courseMap;

  const mkRows = await client
    .select({
      id: mataKuliah.id,
      code: mataKuliah.code,
      title: mataKuliah.title,
      legacyCourseId: mataKuliah.legacyCourseId,
    })
    .from(mataKuliah)
    .where(
      or(
        inArray(mataKuliah.id, rawCourseIds),
        inArray(mataKuliah.code, rawCourseIds),
        inArray(mataKuliah.legacyCourseId, rawCourseIds),
      ),
    );

  const neededLegacyIds = Array.from(
    new Set([
      ...rawCourseIds,
      ...mkRows
        .map((m: any) => m.legacyCourseId)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0),
    ]),
  );

  const legacyRows = neededLegacyIds.length > 0
    ? await client
        .select({
          id: courses.id,
          title: courses.title,
        })
        .from(courses)
        .where(inArray(courses.id, neededLegacyIds))
    : [];

  const legacyTitleById = new Map<string, string>();
  for (const c of legacyRows) {
    legacyTitleById.set(c.id, c.title);
    courseMap.set(c.id, { title: c.title, code: null });
  }

  for (const mk of mkRows) {
    const resolvedTitle =
      mk.title ||
      (mk.legacyCourseId ? legacyTitleById.get(mk.legacyCourseId) : null) ||
      mk.id;
    const entry = { title: resolvedTitle, code: mk.code || null };
    courseMap.set(mk.id, entry);
    if (mk.code) {
      courseMap.set(mk.code, entry);
    }
  }

  return courseMap;
}

export async function queryTutorActivityLogs(
  input: TutorActivityFilterInput,
  client: any = db,
): Promise<TutorActivityQueryResult> {
  const conditions: SQL[] = [buildTutorScopeCondition()];

  if (input.actorId && input.actorId.trim().length > 0) {
    conditions.push(eq(auditMutasi.actorId, input.actorId.trim()));
  }

  if (input.courseId && input.courseId.trim().length > 0) {
    const rawCourse = input.courseId.trim();
    const matchingMk = await client
      .select({
        id: mataKuliah.id,
        code: mataKuliah.code,
        legacyCourseId: mataKuliah.legacyCourseId,
      })
      .from(mataKuliah)
      .where(
        or(
          eq(mataKuliah.id, rawCourse),
          eq(mataKuliah.code, rawCourse),
          eq(mataKuliah.legacyCourseId, rawCourse),
        ),
      );

    const candidateIds = new Set<string>([rawCourse]);
    for (const mk of matchingMk) {
      if (mk.id) candidateIds.add(mk.id);
      if (mk.code) candidateIds.add(mk.code);
      if (mk.legacyCourseId) candidateIds.add(mk.legacyCourseId);
    }

    const idsArray = Array.from(candidateIds);
    if (idsArray.length === 1) {
      conditions.push(eq(auditMutasi.courseId, idsArray[0]));
    } else {
      conditions.push(inArray(auditMutasi.courseId, idsArray));
    }
  }

  if (input.entityType && input.entityType.trim().length > 0) {
    conditions.push(eq(auditMutasi.entityType, input.entityType.trim()));
  }

  if (input.action && input.action.trim().length > 0) {
    conditions.push(eq(auditMutasi.action, input.action.trim()));
  }

  if (input.correlationId && input.correlationId.trim().length > 0) {
    conditions.push(eq(auditMutasi.correlationId, input.correlationId.trim()));
  }

  if (input.outcome && input.outcome !== "all") {
    if (input.outcome === "unclassified") {
      conditions.push(isNull(auditMutasi.outcome));
    } else if (
      input.outcome === "success" ||
      input.outcome === "rejected" ||
      input.outcome === "failed"
    ) {
      conditions.push(eq(auditMutasi.outcome, input.outcome));
    }
  }

  if (input.startDate && input.startDate.trim().length > 0) {
    const start = startOfDay(parseDateInput(input.startDate.trim()));
    conditions.push(gte(auditMutasi.createdAt, start));
  }

  if (input.endDate && input.endDate.trim().length > 0) {
    const endInclusive = startOfDay(parseDateInput(input.endDate.trim()));
    const endExclusive = daysFrom(1, endInclusive);
    conditions.push(lt(auditMutasi.createdAt, endExclusive));
  }

  const validatedCursor = validateCursor(input.cursor);
  if (validatedCursor) {
    conditions.push(
      or(
        lt(auditMutasi.createdAt, validatedCursor.createdAt),
        and(
          eq(auditMutasi.createdAt, validatedCursor.createdAt),
          lt(auditMutasi.id, validatedCursor.id),
        ),
      )!,
    );
  }

  const limit = clampPageSize(input.limit);

  const rows = await client
    .select({
      id: auditMutasi.id,
      actorId: auditMutasi.actorId,
      entityType: auditMutasi.entityType,
      entityId: auditMutasi.entityId,
      action: auditMutasi.action,
      beforeSnapshot: auditMutasi.beforeSnapshot,
      afterSnapshot: auditMutasi.afterSnapshot,
      correlationId: auditMutasi.correlationId,
      courseId: auditMutasi.courseId,
      outcome: auditMutasi.outcome,
      reason: auditMutasi.reason,
      createdAt: auditMutasi.createdAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(auditMutasi)
    .leftJoin(pengguna, eq(auditMutasi.actorId, pengguna.id))
    .leftJoin(user, eq(pengguna.id, user.id))
    .where(and(...conditions))
    .orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  const rawCourseIds: string[] = Array.from(
    new Set(
      pageRows
        .map((r: any) => r.courseId)
        .filter(
          (id: any): id is string =>
            typeof id === "string" && id.trim().length > 0,
        ),
    ),
  );

  const courseMap = await resolveCourseMap(client, rawCourseIds);

  const items: TutorActivityItem[] = pageRows.map((r: any) => {
    const mappedOutcome: "success" | "rejected" | "failed" | "unclassified" =
      r.outcome === "success"
        ? "success"
        : r.outcome === "rejected"
          ? "rejected"
          : r.outcome === "failed"
            ? "failed"
            : "unclassified";

    const courseInfo = r.courseId ? courseMap.get(r.courseId) : null;
    const resolvedTitle = courseInfo?.title ?? r.courseId ?? null;
    const resolvedCode = courseInfo?.code ?? null;

    return {
      id: r.id,
      actorId: r.actorId ?? null,
      actorName: r.userName ?? null,
      actorEmail: r.userEmail ?? null,
      actorImage: r.userImage ?? null,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      courseId: r.courseId ?? null,
      courseTitle: resolvedTitle,
      courseCode: resolvedCode,
      outcome: mappedOutcome,
      reason: r.reason ?? null,
      correlationId: r.correlationId ?? null,
      beforeSnapshot: sanitizeSnapshotSafely(r.beforeSnapshot),
      afterSnapshot: sanitizeSnapshotSafely(r.afterSnapshot),
      createdAt: normalizeDate(r.createdAt),
    };
  });

  const nextCursor =
    hasNextPage && pageRows.length > 0
      ? {
          createdAt:
            pageRows[pageRows.length - 1].createdAt instanceof Date
              ? pageRows[pageRows.length - 1].createdAt.toISOString()
              : new Date(pageRows[pageRows.length - 1].createdAt).toISOString(),
          id: pageRows[pageRows.length - 1].id,
        }
      : null;

  return {
    items,
    nextCursor,
    hasNextPage,
    limit,
  };
}

export async function queryTutorActivityStats(
  client: any = db,
): Promise<TutorActivityStats> {
  const rows = await client
    .select({
      outcome: auditMutasi.outcome,
      count: count(),
    })
    .from(auditMutasi)
    .where(buildTutorScopeCondition())
    .groupBy(auditMutasi.outcome);

  let total = 0;
  let success = 0;
  let rejected = 0;
  let failed = 0;
  let unclassified = 0;

  for (const row of rows) {
    const c = Number(row.count ?? 0);
    total += c;
    if (row.outcome === "success") {
      success += c;
    } else if (row.outcome === "rejected") {
      rejected += c;
    } else if (row.outcome === "failed") {
      failed += c;
    } else {
      unclassified += c;
    }
  }

  return {
    total,
    success,
    rejected,
    failed,
    unclassified,
  };
}

export async function queryTutorActivityFilterOptions(
  client: any = db,
): Promise<TutorActivityFilterOptions> {
  const tutorScopeCondition = buildTutorScopeCondition();

  const [tutorRows, canonicalCourses, legacyCourses, entityTypeRows, actionRows] =
    await Promise.all([
      client
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(penggunaPeran)
        .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
        .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
        .innerJoin(user, eq(pengguna.id, user.id))
        .where(
          and(
            eq(pengguna.status, "active"),
            eq(peran.code, "tutor"),
          ),
        ),
      client
        .select({
          id: mataKuliah.id,
          code: mataKuliah.code,
          title: mataKuliah.title,
        })
        .from(mataKuliah),
      client
        .select({
          id: courses.id,
          title: courses.title,
        })
        .from(courses),
      client
        .select({
          entityType: auditMutasi.entityType,
        })
        .from(auditMutasi)
        .where(tutorScopeCondition)
        .groupBy(auditMutasi.entityType),
      client
        .select({
          action: auditMutasi.action,
        })
        .from(auditMutasi)
        .where(tutorScopeCondition)
        .groupBy(auditMutasi.action),
    ]);

  const uniqueTutorsMap = new Map<string, TutorOption>();
  for (const t of tutorRows) {
    if (t.id && !uniqueTutorsMap.has(t.id)) {
      uniqueTutorsMap.set(t.id, {
        id: t.id,
        name: t.name || t.email,
        email: t.email,
      });
    }
  }

  const courseList: CourseOption[] = [];
  const seenCourseIds = new Set<string>();

  for (const mk of canonicalCourses) {
    if (!seenCourseIds.has(mk.id)) {
      seenCourseIds.add(mk.id);
      courseList.push({
        id: mk.id,
        code: mk.code,
        title: mk.title,
      });
    }
  }

  for (const c of legacyCourses) {
    if (!seenCourseIds.has(c.id)) {
      seenCourseIds.add(c.id);
      courseList.push({
        id: c.id,
        code: null,
        title: c.title,
      });
    }
  }

  const entityTypes = entityTypeRows
    .map((r: any) => r.entityType)
    .filter(Boolean)
    .sort();
  const actions = actionRows
    .map((r: any) => r.action)
    .filter(Boolean)
    .sort();

  return {
    tutors: Array.from(uniqueTutorsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    courses: courseList.sort((a, b) => a.title.localeCompare(b.title)),
    entityTypes,
    actions,
  };
}

export async function queryTutorActivityDetail(
  id: string,
  client: any = db,
): Promise<TutorActivityItem | null> {
  const rows = await client
    .select({
      id: auditMutasi.id,
      actorId: auditMutasi.actorId,
      entityType: auditMutasi.entityType,
      entityId: auditMutasi.entityId,
      action: auditMutasi.action,
      beforeSnapshot: auditMutasi.beforeSnapshot,
      afterSnapshot: auditMutasi.afterSnapshot,
      correlationId: auditMutasi.correlationId,
      courseId: auditMutasi.courseId,
      outcome: auditMutasi.outcome,
      reason: auditMutasi.reason,
      createdAt: auditMutasi.createdAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(auditMutasi)
    .leftJoin(pengguna, eq(auditMutasi.actorId, pengguna.id))
    .leftJoin(user, eq(pengguna.id, user.id))
    .where(and(eq(auditMutasi.id, id), buildTutorScopeCondition()))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  const mappedOutcome: "success" | "rejected" | "failed" | "unclassified" =
    r.outcome === "success"
      ? "success"
      : r.outcome === "rejected"
        ? "rejected"
        : r.outcome === "failed"
          ? "failed"
          : "unclassified";

  const rawCourseIds = r.courseId ? [r.courseId] : [];
  const courseMap = await resolveCourseMap(client, rawCourseIds);
  const courseInfo = r.courseId ? courseMap.get(r.courseId) : null;
  const resolvedTitle = courseInfo?.title ?? r.courseId ?? null;
  const resolvedCode = courseInfo?.code ?? null;

  return {
    id: r.id,
    actorId: r.actorId ?? null,
    actorName: r.userName ?? null,
    actorEmail: r.userEmail ?? null,
    actorImage: r.userImage ?? null,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    courseId: r.courseId ?? null,
    courseTitle: resolvedTitle,
    courseCode: resolvedCode,
    outcome: mappedOutcome,
    reason: r.reason ?? null,
    correlationId: r.correlationId ?? null,
    beforeSnapshot: sanitizeSnapshotSafely(r.beforeSnapshot),
    afterSnapshot: sanitizeSnapshotSafely(r.afterSnapshot),
    createdAt: normalizeDate(r.createdAt),
  };
}
