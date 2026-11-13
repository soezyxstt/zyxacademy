import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  bab,
  chapters,
  courses,
  enrollments,
  mataKuliah,
  pendaftaranMurid,
  pengguna,
  penggunaPeran,
  peran,
  user as authUser,
} from "@/db/schema";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import { mapLegacyRole, membershipIdFor } from "@/lib/auth/peran";
import { isCourseFreeNow, type CoursePricing } from "@/lib/student/course-pricing";

const PREMIUM_PRICING: CoursePricing = { category: "premium", startsAt: null, endsAt: null };

export type CourseAccessTier = "anonymous" | "free" | "enrolled" | "staff";
export type CourseAccessRole = "admin" | "tutor" | "murid" | null;
export type CourseAccessRoleCode = Exclude<CourseAccessRole, null>;
export type CourseAccessContentKind =
  | "article"
  | "diktat"
  | "quiz"
  | "flashcard"
  | "zyra"
  | "diktat-download";

export type CourseAccessDenialReason =
  | "COURSE_NOT_FOUND"
  | "COURSE_INACTIVE"
  | "COURSE_MAPPING_AMBIGUOUS"
  | "USER_INACTIVE";

export type CourseAccessDbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export type CourseChapterAccess = {
  id: string;
  canonicalId: string | null;
  legacyId: string | null;
  title: string;
  orderIndex: number;
  source: "canonical" | "legacy";
};

export type CourseAccessCapabilities = {
  canReadArticle: boolean;
  canReadDiktat: boolean;
  canDownloadDiktat: boolean;
  canStartQuiz: boolean;
  canReviewFlashcard: boolean;
  canAskZyra: boolean;
  zyraDailyQuestionLimit: number | null;
};

export type CourseAccessResult = {
  requestedCourseId: string;
  courseId: string | null;
  publicCourseId: string | null;
  canonicalCourseId: string | null;
  legacyCourseId: string | null;
  courseTitle: string | null;
  isDemo: boolean;
  tier: CourseAccessTier;
  role: CourseAccessRole;
  /** All canonical roles held by the actor, retained for multi-role policy decisions. */
  roles: CourseAccessRoleCode[];
  isAuthenticated: boolean;
  isEnrolled: boolean;
  hasCourseAccess: boolean;
  hasFullContentAccess: boolean;
  pricing: CoursePricing;
  isFreeNow: boolean;
  freeChapters: CourseChapterAccess[];
  freeChapterIds: string[];
  scopedChapterIds: string[];
  capabilities: CourseAccessCapabilities;
  reason?: CourseAccessDenialReason;
};

export type ResolveCourseAccessInput = {
  courseId: string;
  userId?: string | null;
  roleHint?: string | null;
  now?: Date;
};

type CourseIdentity = {
  courseId: string;
  publicCourseId: string;
  canonicalCourseId: string | null;
  legacyCourseId: string | null;
  courseTitle: string;
  isDemo: boolean;
  pricing: CoursePricing;
  status: "active" | "inactive";
  reason?: Extract<CourseAccessDenialReason, "COURSE_NOT_FOUND" | "COURSE_INACTIVE" | "COURSE_MAPPING_AMBIGUOUS">;
};

type ActorState = {
  role: CourseAccessRole;
  roles: ReadonlySet<CourseAccessRoleCode>;
  isAdmin: boolean;
  isTutor: boolean;
  isMurid: boolean;
  isAuthenticated: boolean;
  isActive: boolean;
};

export type CourseChapterCandidate = {
  id: string;
  title: string;
  orderIndex: number;
  canonicalId: string | null;
  legacyId: string | null;
  source: "canonical" | "legacy";
};

const ROLE_CODES = ["admin", "tutor", "murid"] as const;

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyCapabilities(): CourseAccessCapabilities {
  return {
    canReadArticle: false,
    canReadDiktat: false,
    canDownloadDiktat: false,
    canStartQuiz: false,
    canReviewFlashcard: false,
    canAskZyra: false,
    zyraDailyQuestionLimit: 0,
  };
}

function capabilitiesForTier(
  tier: CourseAccessTier,
  role: CourseAccessRole,
  hasCourseAccess: boolean,
  hasFullContentAccess: boolean,
): CourseAccessCapabilities {
  if (!hasCourseAccess || tier === "anonymous") return emptyCapabilities();

  if (tier === "free") {
    return {
      canReadArticle: true,
      canReadDiktat: true,
      canDownloadDiktat: hasFullContentAccess,
      canStartQuiz: true,
      canReviewFlashcard: true,
      canAskZyra: true,
      zyraDailyQuestionLimit: 5,
    };
  }

  return {
    canReadArticle: true,
    canReadDiktat: true,
    canDownloadDiktat: tier === "enrolled" || role === "admin",
    canStartQuiz: true,
    canReviewFlashcard: true,
    canAskZyra: true,
    zyraDailyQuestionLimit: null,
  };
}

function chapterIdsFromRows(rows: readonly CourseChapterCandidate[]): string[] {
  return [...new Set(rows.flatMap((row) => [row.canonicalId, row.legacyId, row.id]
    .filter((id): id is string => Boolean(id))
    .map((id) => id.trim())))];
}

/**
 * Selects the first active chapter after the canonical/legacy source has
 * already been chosen. The stable id tie-breaker keeps the result deterministic
 * if old data contains duplicate order indexes.
 */
export function selectFreeChapters(rows: readonly CourseChapterCandidate[]): CourseChapterAccess[] {
  return [...rows]
    .sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id, "id"))
    .slice(0, 1)
    .map((row) => ({
      id: row.id,
      canonicalId: row.canonicalId,
      legacyId: row.legacyId,
      title: row.title,
      orderIndex: row.orderIndex,
      source: row.source,
    }));
}

function normalizedChapterRefs(chapterIds: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!chapterIds || chapterIds.length === 0) return [];
  const normalized = chapterIds.map(normalizeId);
  return normalized.every(Boolean) ? [...new Set(normalized)] : [];
}

/** Empty or unknown chapter scope is intentionally denied. */
export function hasChapterScopeWithin(
  chapterIds: readonly (string | null | undefined)[] | null | undefined,
  allowedChapterIds: readonly string[] | ReadonlySet<string>,
): boolean {
  const refs = normalizedChapterRefs(chapterIds);
  if (refs.length === 0) return false;
  const allowed = new Set(Array.from(allowedChapterIds, normalizeId).filter(Boolean));
  return refs.every((chapterId) => allowed.has(chapterId));
}

function normalizeContentKind(kind: CourseAccessContentKind): keyof CourseAccessCapabilities | null {
  switch (kind) {
    case "article":
      return "canReadArticle";
    case "diktat":
      return "canReadDiktat";
    case "quiz":
      return "canStartQuiz";
    case "flashcard":
      return "canReviewFlashcard";
    case "zyra":
      return "canAskZyra";
    case "diktat-download":
      return "canDownloadDiktat";
    default:
      return null;
  }
}

/**
 * Applies the course-level decision to a specific product. Every product
 * request must provide a chapter scope, including staff requests, so a
 * missing bab/chapter relation cannot accidentally become public content.
 */
export function canAccessCourseContent(
  access: CourseAccessResult,
  kind: CourseAccessContentKind,
  chapterIds?: readonly (string | null | undefined)[],
): boolean {
  if (!access.hasCourseAccess) return false;
  const capability = normalizeContentKind(kind);
  if (!capability || !access.capabilities[capability]) return false;
  if (!hasChapterScopeWithin(chapterIds, access.scopedChapterIds)) return false;
  if (access.tier === "free" && !access.hasFullContentAccess) {
    return hasChapterScopeWithin(chapterIds, access.freeChapterIds);
  }
  return access.hasFullContentAccess ?? (access.tier === "enrolled" || access.tier === "staff");
}

async function resolveCourseIdentity(
  requestedCourseId: string,
  client: typeof db,
): Promise<CourseIdentity> {
  const [canonicalRows, legacyRows] = await Promise.all([
    client
      .select({
        id: mataKuliah.id,
        title: mataKuliah.title,
        status: mataKuliah.status,
        legacyCourseId: mataKuliah.legacyCourseId,
        isDemo: mataKuliah.isDemo,
        pricingCategory: mataKuliah.pricingCategory,
        freeStartsAt: mataKuliah.freeStartsAt,
        freeEndsAt: mataKuliah.freeEndsAt,
      })
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, requestedCourseId), eq(mataKuliah.legacyCourseId, requestedCourseId)))
      .limit(2),
    client
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(eq(courses.id, requestedCourseId))
      .limit(2),
  ]);

  return projectCourseIdentity(requestedCourseId, canonicalRows, legacyRows);
}

function projectCourseIdentity(
  requestedCourseId: string,
  canonicalRows: Array<{ id: string; title: string; status: string; legacyCourseId: string | null; isDemo: boolean; pricingCategory: CoursePricing["category"]; freeStartsAt: Date | null; freeEndsAt: Date | null }>,
  legacyRows: Array<{ id: string; title: string }>,
): CourseIdentity {
  // A public course identifier is an authorization boundary. Do not choose
  // an arbitrary row when canonical aliases or legacy IDs collide.
  if (canonicalRows.length > 1 || legacyRows.length > 1) {
    return {
      courseId: requestedCourseId,
      publicCourseId: requestedCourseId,
      canonicalCourseId: null,
      legacyCourseId: requestedCourseId,
      courseTitle: "",
      isDemo: false,
      pricing: PREMIUM_PRICING,
      status: "inactive",
      reason: "COURSE_MAPPING_AMBIGUOUS",
    };
  }

  const canonical = canonicalRows[0];
  const legacy = legacyRows[0];

  if (canonical && legacy && canonical.legacyCourseId !== legacy.id) {
    return {
      courseId: requestedCourseId,
      publicCourseId: requestedCourseId,
      canonicalCourseId: null,
      legacyCourseId: requestedCourseId,
      courseTitle: "",
      isDemo: false,
      pricing: PREMIUM_PRICING,
      status: "inactive",
      reason: "COURSE_MAPPING_AMBIGUOUS",
    };
  }

  if (canonical) {
    return {
      courseId: canonical.id,
      publicCourseId: canonical.legacyCourseId ?? canonical.id,
      canonicalCourseId: canonical.id,
      legacyCourseId: canonical.legacyCourseId ?? null,
      courseTitle: canonical.title,
      isDemo: Boolean(canonical.isDemo),
      pricing: { category: canonical.pricingCategory, startsAt: canonical.freeStartsAt, endsAt: canonical.freeEndsAt },
      status: canonical.status === "active" ? "active" : "inactive",
      ...(canonical.status !== "active" ? { reason: "COURSE_INACTIVE" as const } : {}),
    };
  }

  if (!legacy) {
    return {
      courseId: requestedCourseId,
      publicCourseId: requestedCourseId,
      canonicalCourseId: null,
      legacyCourseId: null,
      courseTitle: "",
      isDemo: false,
      pricing: PREMIUM_PRICING,
      status: "inactive",
      reason: "COURSE_NOT_FOUND",
    };
  }
  return {
    courseId: legacy.id,
    publicCourseId: legacy.id,
    canonicalCourseId: null,
    legacyCourseId: legacy.id,
    courseTitle: legacy.title,
    isDemo: false,
    pricing: PREMIUM_PRICING,
    status: "active",
  };
}

async function resolveActor(
  userId: string,
  client: typeof db,
): Promise<ActorState> {
  if (!userId) {
    return {
      role: null,
      roles: new Set(),
      isAdmin: false,
      isTutor: false,
      isMurid: false,
      isAuthenticated: false,
      isActive: true,
    };
  }

  const [[existingIdentity], [knownAuthUser]] = await Promise.all([
    client
      .select({ status: pengguna.status })
      .from(pengguna)
      .where(eq(pengguna.id, userId))
      .limit(1),
    client
      .select({ id: authUser.id, createdAt: authUser.createdAt, updatedAt: authUser.updatedAt, role: authUser.role })
      .from(authUser)
      .where(eq(authUser.id, userId))
      .limit(1),
  ]);
  let identity: { status: "active" | "suspended" } | null | undefined = existingIdentity;
  if (identity?.status === "suspended") {
    return {
      role: null,
      roles: new Set(),
      isAdmin: false,
      isTutor: false,
      isMurid: false,
      isAuthenticated: true,
      isActive: false,
    };
  }

  // Older Better Auth accounts can predate the canonical identity migration.
  // Provision the identity before granting the Free lane so every downstream
  // canonical write, including allowance leases, has a valid FK target.
  if (!identity && knownAuthUser) {
    try {
      // The legacy role must be carried into the canonical membership during
      // provisioning. Otherwise a legacy staff account becomes roleless after
      // its first Free-course request and canonical guards deny it.
      const legacyRole = mapLegacyRole(knownAuthUser.role ?? "student");
      if (!legacyRole) throw new Error("Unsupported Better Auth role");
      const [roleRecord] = await client
        .select({ id: peran.id })
        .from(peran)
        .where(eq(peran.code, legacyRole))
        .limit(1);
      if (!roleRecord) throw new Error("Canonical role seed is unavailable");

      // Keep these idempotent writes on the caller's executor. Some supported
      // SQLite test and edge adapters do not preserve an in-memory schema
      // across a transaction handle, while the conflict guards still make
      // concurrent provisioning safe.
      await client
        .insert(pengguna)
        .values({
          id: userId,
          status: "active",
          createdAt: knownAuthUser.createdAt,
          updatedAt: knownAuthUser.updatedAt,
        })
        .onConflictDoNothing();
      await client
        .insert(penggunaPeran)
        .values({
          id: membershipIdFor(userId, legacyRole),
          penggunaId: userId,
          peranId: roleRecord.id,
          source: "better_auth_user_create",
          auditActorPenggunaId: null,
          createdAt: knownAuthUser.createdAt,
        })
        .onConflictDoNothing();
      const [provisionedIdentity] = await client
        .select({ status: pengguna.status })
        .from(pengguna)
        .where(eq(pengguna.id, userId))
        .limit(1);
      identity = provisionedIdentity ?? null;
    } catch {
      identity = null;
    }
  }

  // An arbitrary caller-supplied user ID, or a failed provisioning attempt,
  // must not receive the authenticated Free fallback.
  if (!identity) {
    return {
      role: null,
      roles: new Set(),
      isAdmin: false,
      isTutor: false,
      isMurid: false,
      isAuthenticated: true,
      isActive: false,
    };
  }

  let roleRows = await client
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(and(
      eq(penggunaPeran.penggunaId, userId),
      eq(pengguna.status, "active"),
      inArray(peran.code, [...ROLE_CODES]),
    ));

  // A previous request may have created the canonical identity before the
  // membership write failed. Retry that missing membership on every request
  // so a transient failure cannot permanently downgrade a legacy staff user.
  if (roleRows.length === 0 && knownAuthUser) {
    try {
      const legacyRole = mapLegacyRole(knownAuthUser.role ?? "student");
      if (legacyRole) {
        const [roleRecord] = await client
          .select({ id: peran.id })
          .from(peran)
          .where(eq(peran.code, legacyRole))
          .limit(1);
        if (roleRecord) {
          await client
            .insert(penggunaPeran)
            .values({
              id: membershipIdFor(userId, legacyRole),
              penggunaId: userId,
              peranId: roleRecord.id,
              source: "better_auth_user_create",
              auditActorPenggunaId: null,
              createdAt: knownAuthUser.createdAt,
            })
            .onConflictDoNothing();
          roleRows = [{ code: legacyRole }];
        }
      }
    } catch {
      // Keep the compatibility fallback for this request; the next request
      // retries the membership repair before resolving the actor again.
    }
  }
  const roles = new Set<CourseAccessRoleCode>(
    roleRows
      .map((row) => row.code)
      .filter((code): code is CourseAccessRoleCode => ROLE_CODES.includes(code as CourseAccessRoleCode)),
  );

  // Older rows can predate the normalized role membership. Keep their
  // authenticated student behavior without trusting a session role hint,
  // while never inferring staff capability from that compatibility fallback.
  if (roles.size === 0) roles.add("murid");

  const isAdmin = roles.has("admin");
  const isTutor = roles.has("tutor");
  const isMurid = roles.has("murid");
  const role = isAdmin
    ? "admin"
    : isTutor
      ? "tutor"
      : isMurid
        ? "murid"
        : null;
  return { role, roles, isAdmin, isTutor, isMurid, isAuthenticated: true, isActive: true };
}

async function resolveStaffCourseAccess(
  actor: ActorState,
  userId: string,
  courseId: string,
  client: typeof db,
): Promise<boolean> {
  // Admin is the deliberate global override. Tutor access is never inferred
  // from the session role or from a course enrollment; it must come from the
  // canonical tutor assignment resolver.
  if (actor.isAdmin) return true;
  if (!actor.isTutor) return false;

  try {
    const result = await checkTutorCourseAccess(
      userId,
      courseId,
      { allowAdmin: false },
      client,
    );
    return result.hasAccess;
  } catch {
    // Missing or unavailable assignment data must fail closed. The caller can
    // still resolve an enrolled student lane when that is independently valid.
    return false;
  }
}

async function resolveEnrollment(
  userId: string,
  identity: CourseIdentity,
  now: Date,
  client: typeof db,
): Promise<boolean> {
  if (!userId || identity.status !== "active" || Number.isNaN(now.getTime())) return false;

  if (identity.canonicalCourseId) {
    const [canonicalEnrollment] = await client
      .select({ id: pendaftaranMurid.id })
      .from(pendaftaranMurid)
      .where(and(
        eq(pendaftaranMurid.penggunaId, userId),
        eq(pendaftaranMurid.mataKuliahId, identity.canonicalCourseId),
        inArray(pendaftaranMurid.status, ["active", "completed"]),
        or(isNull(pendaftaranMurid.endAt), gt(pendaftaranMurid.endAt, now)),
      ))
      .limit(1);
    if (canonicalEnrollment) return true;
  }

  const legacyCourseId = identity.legacyCourseId ?? identity.courseId;
  const [legacyEnrollment] = await client
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, userId),
      eq(enrollments.courseId, legacyCourseId),
      gt(enrollments.expiresAt, now),
    ))
    .limit(1);
  return Boolean(legacyEnrollment);
}

async function resolveActiveChapters(
  identity: CourseIdentity,
  client: typeof db,
): Promise<CourseChapterCandidate[]> {
  if (identity.status !== "active") return [];

  if (identity.canonicalCourseId) {
    const canonicalRows = await client
      .select({
        id: bab.id,
        title: bab.title,
        orderIndex: bab.orderIndex,
        legacyId: bab.legacyChapterId,
        status: bab.status,
      })
      .from(bab)
      .where(eq(bab.mataKuliahId, identity.canonicalCourseId))
      .orderBy(asc(bab.orderIndex), asc(bab.id));
    if (canonicalRows.length > 0) {
      return canonicalRows.filter((row) => row.status === "active").map((row) => ({
        id: row.id,
        title: row.title,
        orderIndex: row.orderIndex,
        canonicalId: row.id,
        legacyId: row.legacyId ?? null,
        source: "canonical" as const,
      }));
    }
  }

  if (!identity.legacyCourseId && !identity.canonicalCourseId) return [];
  const legacyCourseId = identity.legacyCourseId ?? identity.courseId;
  const legacyRows = await client
    .select({
      id: chapters.id,
      title: chapters.title,
      orderIndex: chapters.orderIndex,
    })
    .from(chapters)
    .where(and(eq(chapters.courseId, legacyCourseId), eq(chapters.status, "published")))
    .orderBy(asc(chapters.orderIndex), asc(chapters.id));
  return legacyRows.map((row) => ({
    id: row.id,
    title: row.title,
    orderIndex: row.orderIndex,
    canonicalId: null,
    legacyId: row.id,
    source: "legacy" as const,
  }));
}

function deniedResult(
  input: ResolveCourseAccessInput,
  identity: CourseIdentity,
  actor: ActorState,
  isEnrolled: boolean,
  reason?: CourseAccessDenialReason,
): CourseAccessResult {
  const tier: CourseAccessTier = !actor.isAuthenticated
    ? "anonymous"
    : actor.isAdmin
      ? "staff"
      : actor.isMurid
        ? isEnrolled
          ? "enrolled"
          : "free"
        : "anonymous";
  return {
    requestedCourseId: input.courseId,
    courseId: identity.status === "active" ? identity.courseId : null,
    publicCourseId: identity.status === "active" ? identity.publicCourseId : null,
    canonicalCourseId: identity.canonicalCourseId,
    legacyCourseId: identity.legacyCourseId,
    courseTitle: identity.courseTitle || null,
    isDemo: identity.isDemo,
    tier,
    role: actor.role,
    roles: ROLE_CODES.filter((code) => actor.roles.has(code)),
    isAuthenticated: actor.isAuthenticated,
    isEnrolled,
    hasCourseAccess: false,
    hasFullContentAccess: false,
    pricing: identity.pricing,
    isFreeNow: isCourseFreeNow(identity.pricing, input.now ?? new Date()),
    freeChapters: [],
    freeChapterIds: [],
    scopedChapterIds: [],
    capabilities: emptyCapabilities(),
    reason: reason ?? identity.reason,
  };
}

/** Resolves the one explicitly selected demo course. */
export async function resolveDemoCourse(
  executor?: CourseAccessDbExecutor,
): Promise<CourseAccessResult | null> {
  const client = (executor ?? db) as typeof db;
  const rows = await client
    .select({ id: mataKuliah.id })
    .from(mataKuliah)
    .where(and(eq(mataKuliah.status, "active"), eq(mataKuliah.isDemo, true)))
    .limit(2);
  if (rows.length !== 1) return null;
  return resolveCourseAccess({ courseId: rows[0].id }, client);
}

/**
 * Central course policy. Anonymous users only resolve the selected demo
 * course for static preview; authenticated non-enrolled murid users get the
 * Free lane for every active course. Enrolled and staff users retain their
 * broader access tier.
 */
export async function resolveCourseAccess(
  input: ResolveCourseAccessInput,
  executor?: CourseAccessDbExecutor,
): Promise<CourseAccessResult> {
  const client = (executor ?? db) as typeof db;
  const requestedCourseId = normalizeId(input.courseId);
  const userId = normalizeId(input.userId);
  const normalizedInput = { ...input, courseId: requestedCourseId };
  const emptyIdentity: CourseIdentity = {
    courseId: requestedCourseId,
    publicCourseId: requestedCourseId,
    canonicalCourseId: null,
    legacyCourseId: null,
    courseTitle: "",
    isDemo: false,
    pricing: PREMIUM_PRICING,
    status: "inactive",
    reason: "COURSE_NOT_FOUND",
  };
  if (!requestedCourseId) {
    return deniedResult(normalizedInput, emptyIdentity, {
      role: null,
      roles: new Set(),
      isAdmin: false,
      isTutor: false,
      isMurid: false,
      isAuthenticated: Boolean(userId),
      isActive: true,
    }, false, "COURSE_NOT_FOUND");
  }

  const [identity, actor] = await Promise.all([
    resolveCourseIdentity(requestedCourseId, client),
    resolveActor(userId, client),
  ]);
  if (identity.status !== "active") {
    return deniedResult(normalizedInput, identity, actor, false, identity.reason);
  }
  if (!actor.isActive) {
    return deniedResult(normalizedInput, identity, actor, false, "USER_INACTIVE");
  }

  const now = input.now ?? new Date();
  const isEnrolled = await resolveEnrollment(userId, identity, now, client);
  const isStaff = await resolveStaffCourseAccess(actor, userId, identity.courseId, client);
  const activeRows = await resolveActiveChapters(identity, client);
  return projectCourseAccess(requestedCourseId, identity, actor, isEnrolled, isStaff, activeRows, now);
}

function projectCourseAccess(
  requestedCourseId: string,
  identity: CourseIdentity,
  actor: ActorState,
  isEnrolled: boolean,
  isStaff: boolean,
  activeRows: CourseChapterCandidate[],
  now: Date,
): CourseAccessResult {
  // Enrollment is a student entitlement only. A tutor may have a stale or
  // accidental student enrollment row, but it must never turn into course
  // staff access without the canonical active course assignment above.
  const isStudent = actor.isMurid;
  const hasCourseAccess = isStaff
    || (isStudent && (isEnrolled || actor.isAuthenticated))
    || (!actor.isAuthenticated && identity.isDemo);
  const tier: CourseAccessTier = isStaff
    ? "staff"
    : isStudent
      ? isEnrolled
        ? "enrolled"
        : actor.isAuthenticated
          ? "free"
          : "anonymous"
      : "anonymous";
  const isFreeNow = isCourseFreeNow(identity.pricing, now);
  const hasFullContentAccess = hasCourseAccess && actor.isAuthenticated
    && (isStaff || (isStudent && (isEnrolled || isFreeNow)));
  const freeChapters = selectFreeChapters(activeRows);
  const freeChapterIds = chapterIdsFromRows(freeChapters);
  const scopedChapterIds = chapterIdsFromRows(activeRows);
  return {
    requestedCourseId,
    courseId: identity.courseId,
    publicCourseId: identity.publicCourseId,
    canonicalCourseId: identity.canonicalCourseId,
    legacyCourseId: identity.legacyCourseId,
    courseTitle: identity.courseTitle,
    isDemo: identity.isDemo,
    tier,
    role: actor.role,
    roles: ROLE_CODES.filter((code) => actor.roles.has(code)),
    isAuthenticated: actor.isAuthenticated,
    isEnrolled,
    hasCourseAccess,
    hasFullContentAccess,
    pricing: identity.pricing,
    isFreeNow,
    freeChapters,
    freeChapterIds,
    scopedChapterIds,
    capabilities: capabilitiesForTier(tier, actor.role, hasCourseAccess && actor.isAuthenticated, hasFullContentAccess),
  };
}

/** Batch course policy for an already authenticated request. All identity,
 * actor, enrollment and chapter decisions use the same rules as the single reader. */
export async function resolveCourseAccessBatch(userId: string, courseIds: readonly string[], options?: { now?: Date; executor?: CourseAccessDbExecutor }): Promise<Map<string, CourseAccessResult>> {
  const client = (options?.executor ?? db) as typeof db;
  const now = options?.now ?? new Date();
  const ids = [...new Set(courseIds.map(normalizeId).filter(Boolean))];
  if (!ids.length) return new Map();
  const [actor, canonical, legacy] = await Promise.all([
    resolveActor(normalizeId(userId), client),
    client.select({ id: mataKuliah.id, title: mataKuliah.title, status: mataKuliah.status,
      legacyCourseId: mataKuliah.legacyCourseId, isDemo: mataKuliah.isDemo, pricingCategory: mataKuliah.pricingCategory, freeStartsAt: mataKuliah.freeStartsAt, freeEndsAt: mataKuliah.freeEndsAt }).from(mataKuliah)
      .where(or(inArray(mataKuliah.id, ids), inArray(mataKuliah.legacyCourseId, ids))),
    client.select({ id: courses.id, title: courses.title }).from(courses).where(inArray(courses.id, ids)),
  ]);
  const identities = ids.map((id) => ({ id, identity: projectCourseIdentity(id,
    canonical.filter((row) => row.id === id || row.legacyCourseId === id), legacy.filter((row) => row.id === id)) }));
  const canonicalIds = [...new Set(identities.flatMap(({ identity }) => identity.status === "active" && identity.canonicalCourseId ? [identity.canonicalCourseId] : []))];
  const legacyIds = [...new Set(identities.flatMap(({ identity }) => identity.status === "active" ? [identity.legacyCourseId ?? identity.courseId] : []))];
  const [canonicalEnrollments, legacyEnrollments, canonicalChapters, legacyChapters] = await Promise.all([
    canonicalIds.length ? client.select({ id: pendaftaranMurid.mataKuliahId }).from(pendaftaranMurid).where(and(
      eq(pendaftaranMurid.penggunaId, userId), inArray(pendaftaranMurid.mataKuliahId, canonicalIds),
      inArray(pendaftaranMurid.status, ["active", "completed"]), or(isNull(pendaftaranMurid.endAt), gt(pendaftaranMurid.endAt, now)),
    )) : [],
    legacyIds.length ? client.select({ id: enrollments.courseId }).from(enrollments).where(and(
      eq(enrollments.userId, userId), inArray(enrollments.courseId, legacyIds), gt(enrollments.expiresAt, now),
    )) : [],
    canonicalIds.length ? client.select({ courseId: bab.mataKuliahId, id: bab.id, title: bab.title,
      orderIndex: bab.orderIndex, legacyId: bab.legacyChapterId, status: bab.status }).from(bab)
      .where(inArray(bab.mataKuliahId, canonicalIds)).orderBy(asc(bab.orderIndex), asc(bab.id)) : [],
    legacyIds.length ? client.select({ courseId: chapters.courseId, id: chapters.id, title: chapters.title,
      orderIndex: chapters.orderIndex }).from(chapters)
      .where(and(inArray(chapters.courseId, legacyIds), eq(chapters.status, "published"))).orderBy(asc(chapters.orderIndex), asc(chapters.id)) : [],
  ]);
  const canonicalEnrolled = new Set(canonicalEnrollments.map((row) => row.id));
  const legacyEnrolled = new Set(legacyEnrollments.map((row) => row.id));
  const results = await Promise.all(identities.map(async ({ id, identity }) => {
    const input = { courseId: id, userId, now };
    if (identity.status !== "active") return [id, deniedResult(input, identity, actor, false, identity.reason)] as const;
    if (!actor.isActive) return [id, deniedResult(input, identity, actor, false, "USER_INACTIVE")] as const;
    const isEnrolled = Boolean((identity.canonicalCourseId && canonicalEnrolled.has(identity.canonicalCourseId)) || legacyEnrolled.has(identity.legacyCourseId ?? identity.courseId));
    const isStaff = await resolveStaffCourseAccess(actor, userId, identity.courseId, client);
    const canonicalRows = canonicalChapters.filter((row) => row.courseId === identity.canonicalCourseId);
    const activeRows: CourseChapterCandidate[] = canonicalRows.length
      ? canonicalRows.filter((row) => row.status === "active").map((row) => ({ id: row.id, canonicalId: row.id, legacyId: row.legacyId, title: row.title, orderIndex: row.orderIndex, source: "canonical" }))
      : legacyChapters.filter((row) => row.courseId === (identity.legacyCourseId ?? identity.courseId))
          .map((row) => ({ id: row.id, canonicalId: null, legacyId: row.id, title: row.title, orderIndex: row.orderIndex, source: "legacy" }));
    return [id, projectCourseAccess(id, identity, actor, isEnrolled, isStaff, activeRows, now)] as const;
  }));
  return new Map(results);
}

export const resolveStudentCourseAccess = resolveCourseAccess;
