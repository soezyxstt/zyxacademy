import { cache } from "react";
import { getPeranCodes } from "@/lib/auth/authorization";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  mataKuliah,
  pengguna,
  penggunaPeran,
  penugasanTutor,
  peran,
  tutorCourses,
} from "@/db/schema";

export type TutorAccessSource =
  | "canonical_assignment"
  | "compatibility_fallback"
  | "admin_override";

export type TutorCourseAccessDenialReason =
  | "PENGGUNA_NOT_FOUND"
  | "PENGGUNA_INACTIVE"
  | "COURSE_NOT_FOUND"
  | "COURSE_INACTIVE"
  | "ROLE_NOT_AUTHORIZED"
  | "NO_ACTIVE_ASSIGNMENT";

export interface TutorCourseAccessOptions {
  allowAdmin?: boolean;
}

export interface TutorCourseAccessInput {
  penggunaId: string;
  courseId: string;
  allowAdmin?: boolean;
}

export interface TutorCourseAccessResult {
  hasAccess: boolean;
  penggunaId: string;
  courseId: string | null;
  legacyCourseId: string | null;
  source: TutorAccessSource | null;
  isCompatibilityFallback: boolean;
  reason?: string;
}

export type DbExecutor = {
  select: (...args: any[]) => any;
};

async function resolveTutorCourseAccessUncached(
  input: TutorCourseAccessInput,
  executor?: DbExecutor,
): Promise<TutorCourseAccessResult> {
  const client = (executor ?? db) as typeof db;
  const rawPenggunaId = typeof input.penggunaId === "string" ? input.penggunaId.trim() : "";
  const rawCourseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
  const allowAdmin = input.allowAdmin === true;

  if (!rawPenggunaId) {
    return {
      hasAccess: false,
      penggunaId: "",
      courseId: null,
      legacyCourseId: null,
      source: null,
      isCompatibilityFallback: false,
      reason: "PENGGUNA_NOT_FOUND",
    };
  }

  if (!rawCourseId) {
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: null,
      legacyCourseId: null,
      source: null,
      isCompatibilityFallback: false,
      reason: "COURSE_NOT_FOUND",
    };
  }

  const userRows = await client
    .select({ id: pengguna.id, status: pengguna.status })
    .from(pengguna)
    .where(eq(pengguna.id, rawPenggunaId))
    .limit(1);

  if (userRows.length === 0) {
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: null,
      legacyCourseId: null,
      source: null,
      isCompatibilityFallback: false,
      reason: "PENGGUNA_NOT_FOUND",
    };
  }

  if (userRows[0].status !== "active") {
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: null,
      legacyCourseId: null,
      source: null,
      isCompatibilityFallback: false,
      reason: "PENGGUNA_INACTIVE",
    };
  }

  // 1. Exact canonical course ID lookup (highest priority)
  const canonicalRows = await client
    .select({
      id: mataKuliah.id,
      legacyCourseId: mataKuliah.legacyCourseId,
      status: mataKuliah.status,
    })
    .from(mataKuliah)
    .where(eq(mataKuliah.id, rawCourseId))
    .limit(1);

  let resolvedCourseId: string;
  let resolvedLegacyCourseId: string | null = null;

  if (canonicalRows.length > 0) {
    const course = canonicalRows[0];
    if (course.status !== "active") {
      return {
        hasAccess: false,
        penggunaId: rawPenggunaId,
        courseId: course.id,
        legacyCourseId: course.legacyCourseId ?? null,
        source: null,
        isCompatibilityFallback: false,
        reason: "COURSE_INACTIVE",
      };
    }
    resolvedCourseId = course.id;
    resolvedLegacyCourseId = course.legacyCourseId ?? null;
  } else {
    // 2. Legacy course ID lookup on mataKuliah
    const legacyMappedRows = await client
      .select({
        id: mataKuliah.id,
        legacyCourseId: mataKuliah.legacyCourseId,
        status: mataKuliah.status,
      })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, rawCourseId));

    if (legacyMappedRows.length === 0) {
      return {
        hasAccess: false,
        penggunaId: rawPenggunaId,
        courseId: null,
        legacyCourseId: null,
        source: null,
        isCompatibilityFallback: false,
        reason: "COURSE_NOT_FOUND",
      };
    }

    const activeMappedRows = legacyMappedRows.filter(
      (r: { status: string }) => r.status === "active",
    );

    if (activeMappedRows.length > 1) {
      // Duplicate active mappings for this legacyCourseId fail closed
      return {
        hasAccess: false,
        penggunaId: rawPenggunaId,
        courseId: null,
        legacyCourseId: rawCourseId,
        source: null,
        isCompatibilityFallback: false,
        reason: "COURSE_NOT_FOUND",
      };
    }

    if (activeMappedRows.length === 0) {
      const inactiveCourse = legacyMappedRows[0];
      return {
        hasAccess: false,
        penggunaId: rawPenggunaId,
        courseId: inactiveCourse.id,
        legacyCourseId: inactiveCourse.legacyCourseId ?? null,
        source: null,
        isCompatibilityFallback: false,
        reason: "COURSE_INACTIVE",
      };
    }

    resolvedCourseId = activeMappedRows[0].id;
    resolvedLegacyCourseId = activeMappedRows[0].legacyCourseId ?? null;
  }

  const roleCodes = executor
    ? (await client
        .select({ code: peran.code })
        .from(penggunaPeran)
        .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
        .where(eq(penggunaPeran.penggunaId, rawPenggunaId)))
        .map((r: { code: string }) => r.code)
    : await getPeranCodes(rawPenggunaId);
  const isTutor = roleCodes.includes("tutor");
  const isAdmin = roleCodes.includes("admin");

  if (allowAdmin && isAdmin) {
    return {
      hasAccess: true,
      penggunaId: rawPenggunaId,
      courseId: resolvedCourseId,
      legacyCourseId: resolvedLegacyCourseId,
      source: "admin_override",
      isCompatibilityFallback: false,
    };
  }

  if (!isTutor) {
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: resolvedCourseId,
      legacyCourseId: resolvedLegacyCourseId,
      source: null,
      isCompatibilityFallback: false,
      reason: "ROLE_NOT_AUTHORIZED",
    };
  }

  const assignmentRows = await client
    .select({
      id: penugasanTutor.id,
      status: penugasanTutor.status,
      assignmentScope: penugasanTutor.assignmentScope,
    })
    .from(penugasanTutor)
    .where(
      and(
        eq(penugasanTutor.penggunaId, rawPenggunaId),
        eq(penugasanTutor.mataKuliahId, resolvedCourseId),
      ),
    );

  if (assignmentRows.length > 0) {
    const hasActiveCourseAssignment = assignmentRows.some(
      (row: { status: string; assignmentScope: string }) =>
        row.status === "active" && row.assignmentScope === "course",
    );
    if (hasActiveCourseAssignment) {
      return {
        hasAccess: true,
        penggunaId: rawPenggunaId,
        courseId: resolvedCourseId,
        legacyCourseId: resolvedLegacyCourseId,
        source: "canonical_assignment",
        isCompatibilityFallback: false,
      };
    }

    // Any canonical penugasan_tutor row (inactive or non-course scope) blocks fallback
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: resolvedCourseId,
      legacyCourseId: resolvedLegacyCourseId,
      source: null,
      isCompatibilityFallback: false,
      reason: "NO_ACTIVE_ASSIGNMENT",
    };
  }

  // Compatibility fallback: query tutor_courses ONLY for a verified mapped legacy course ID
  if (!resolvedLegacyCourseId) {
    return {
      hasAccess: false,
      penggunaId: rawPenggunaId,
      courseId: resolvedCourseId,
      legacyCourseId: null,
      source: null,
      isCompatibilityFallback: false,
      reason: "NO_ACTIVE_ASSIGNMENT",
    };
  }

  const legacyAssignmentRows = await client
    .select({ id: tutorCourses.id })
    .from(tutorCourses)
    .where(
      and(
        eq(tutorCourses.tutorId, rawPenggunaId),
        eq(tutorCourses.courseId, resolvedLegacyCourseId),
      ),
    )
    .limit(1);

  if (legacyAssignmentRows.length > 0) {
    return {
      hasAccess: true,
      penggunaId: rawPenggunaId,
      courseId: resolvedCourseId,
      legacyCourseId: resolvedLegacyCourseId,
      source: "compatibility_fallback",
      isCompatibilityFallback: true,
    };
  }

  return {
    hasAccess: false,
    penggunaId: rawPenggunaId,
    courseId: resolvedCourseId,
    legacyCourseId: resolvedLegacyCourseId,
    source: null,
    isCompatibilityFallback: false,
    reason: "NO_ACTIVE_ASSIGNMENT",
  };
}

// Primitive keys keep independently created inputs equivalent within an RSC render.
const cachedTutorCourseAccess = cache((penggunaId: string, courseId: string, allowAdmin: boolean) =>
  resolveTutorCourseAccessUncached({ penggunaId, courseId, allowAdmin }),
);

export function resolveTutorCourseAccess(input: TutorCourseAccessInput, executor?: DbExecutor): Promise<TutorCourseAccessResult> {
  if (executor) return resolveTutorCourseAccessUncached(input, executor);
  return cachedTutorCourseAccess(input.penggunaId, input.courseId, input.allowAdmin === true);
}

export async function checkTutorCourseAccess(
  penggunaId: string,
  courseId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
): Promise<TutorCourseAccessResult> {
  return resolveTutorCourseAccess(
    {
      penggunaId,
      courseId,
      allowAdmin: options?.allowAdmin,
    },
    executor,
  );
}

export async function requireTutorCourseAccess(
  penggunaId: string,
  courseId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
): Promise<TutorCourseAccessResult> {
  const result = await checkTutorCourseAccess(penggunaId, courseId, options, executor);
  if (!result.hasAccess) {
    throw new Error(`TUTOR_ACCESS_DENIED: ${result.reason ?? "FORBIDDEN"}`);
  }
  return result;
}

async function listTutorAccessibleCoursesUncached(
  penggunaId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
): Promise<
  Array<{
    courseId: string;
    legacyCourseId: string | null;
    source: TutorAccessSource;
    isCompatibilityFallback: boolean;
  }>
> {
  const client = (executor ?? db) as typeof db;
  const rawPenggunaId = typeof penggunaId === "string" ? penggunaId.trim() : "";
  const allowAdmin = options?.allowAdmin === true;

  if (!rawPenggunaId) return [];

  const userRows = await client
    .select({ id: pengguna.id, status: pengguna.status })
    .from(pengguna)
    .where(eq(pengguna.id, rawPenggunaId))
    .limit(1);

  if (userRows.length === 0 || userRows[0].status !== "active") return [];

  const roleCodes = executor
    ? (await client
        .select({ code: peran.code })
        .from(penggunaPeran)
        .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
        .where(eq(penggunaPeran.penggunaId, rawPenggunaId)))
        .map((r: { code: string }) => r.code)
    : await getPeranCodes(rawPenggunaId);
  const isTutor = roleCodes.includes("tutor");
  const isAdmin = roleCodes.includes("admin");

  if (allowAdmin && isAdmin) {
    const allCourses = await client
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"));

    return allCourses.map((c: { id: string; legacyCourseId: string | null }) => ({
      courseId: c.id,
      legacyCourseId: c.legacyCourseId ?? null,
      source: "admin_override" as const,
      isCompatibilityFallback: false,
    }));
  }

  if (!isTutor) return [];

  const canonicalAssignments = await client
    .select({
      mataKuliahId: penugasanTutor.mataKuliahId,
      legacyCourseId: mataKuliah.legacyCourseId,
      status: penugasanTutor.status,
      assignmentScope: penugasanTutor.assignmentScope,
    })
    .from(penugasanTutor)
    .innerJoin(mataKuliah, eq(penugasanTutor.mataKuliahId, mataKuliah.id))
    .where(
      and(
        eq(penugasanTutor.penggunaId, rawPenggunaId),
        eq(mataKuliah.status, "active"),
      ),
    );

  const results = new Map<
    string,
    {
      courseId: string;
      legacyCourseId: string | null;
      source: TutorAccessSource;
      isCompatibilityFallback: boolean;
    }
  >();

  const canonicalAssignedCourseIds = new Set<string>();

  for (const row of canonicalAssignments) {
    canonicalAssignedCourseIds.add(row.mataKuliahId);
    if (row.status === "active" && row.assignmentScope === "course") {
      results.set(row.mataKuliahId, {
        courseId: row.mataKuliahId,
        legacyCourseId: row.legacyCourseId ?? null,
        source: "canonical_assignment",
        isCompatibilityFallback: false,
      });
    }
  }

  const legacyAssignments = await client
    .select({
      courseId: tutorCourses.courseId,
    })
    .from(tutorCourses)
    .where(eq(tutorCourses.tutorId, rawPenggunaId));

  const rawLegacyCourseIds = Array.from(
    new Set(
      legacyAssignments
        .map((leg: { courseId: string }) => (typeof leg.courseId === "string" ? leg.courseId.trim() : ""))
        .filter((id: string) => id.length > 0),
    ),
  );

  if (rawLegacyCourseIds.length > 0) {
    const matchingMataKuliahList = await client
      .select({
        id: mataKuliah.id,
        legacyCourseId: mataKuliah.legacyCourseId,
        status: mataKuliah.status,
      })
      .from(mataKuliah)
      .where(
        and(
          eq(mataKuliah.status, "active"),
          inArray(mataKuliah.legacyCourseId, rawLegacyCourseIds),
        ),
      );

    const mkByLegacyId = new Map<string, Array<{ id: string; legacyCourseId: string | null }>>();

    for (const mk of matchingMataKuliahList) {
      if (mk.legacyCourseId) {
        const list = mkByLegacyId.get(mk.legacyCourseId) ?? [];
        list.push(mk);
        mkByLegacyId.set(mk.legacyCourseId, list);
      }
    }

    for (const legCourseId of rawLegacyCourseIds) {
      const matches = mkByLegacyId.get(legCourseId);
      if (!matches || matches.length === 0) {
        continue;
      }
      if (matches.length > 1) {
        // Duplicate active mappings fail closed; do not silently overwrite
        continue;
      }
      const match = matches[0];
      const canonicalId = match.id;
      const legacyId = match.legacyCourseId ?? null;
      if (canonicalAssignedCourseIds.has(canonicalId)) {
        // Canonical assignment row exists for this tutor and course; legacy fallback is disabled
        continue;
      }
      if (!results.has(canonicalId)) {
        results.set(canonicalId, {
          courseId: canonicalId,
          legacyCourseId: legacyId,
          source: "compatibility_fallback",
          isCompatibilityFallback: true,
        });
      }
    }
  }

  return Array.from(results.values());
}

const cachedTutorAccessibleCourses = cache((penggunaId: string, allowAdmin: boolean) =>
  listTutorAccessibleCoursesUncached(penggunaId, { allowAdmin }),
);

export function listTutorAccessibleCourses(
  penggunaId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
): ReturnType<typeof listTutorAccessibleCoursesUncached> {
  if (executor) return listTutorAccessibleCoursesUncached(penggunaId, options, executor);
  return cachedTutorAccessibleCourses(penggunaId, options?.allowAdmin === true);
}
