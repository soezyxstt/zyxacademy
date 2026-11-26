export interface BookingCourseOption {
  id: string;
  title: string;
}

export interface BookingGroupLike {
  id: string;
  name?: string | null;
  status?: string | null;
  totalQuotaSessions?: number | null;
  usedQuotaSessions?: number | null;
  courses?: Array<{
    courseId?: string | null;
    course?: { id?: string | null; title?: string | null; name?: string | null } | null;
    id?: string | null;
    title?: string | null;
    name?: string | null;
  }> | null;
}

export interface BookingSlotLike {
  id?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  courseId?: string | null;
  matchedCourseIds?: readonly string[] | null;
  tutor?: {
    tutorCourses?: Array<{
      courseId?: string | null;
      course?: { id?: string | null } | null;
    }> | null;
  } | null;
}

export interface GroupQuotaSummary {
  total: number;
  used: number;
  remaining: number;
  isZeroQuota: boolean;
  isExhausted: boolean;
  isInactive: boolean;
  canBook: boolean;
}

function parseHhMmToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value.trim())) return null;
  const [hourStr, minuteStr] = value.trim().split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * Computes slot duration in minutes from HH:MM start/end strings, falling back
 * to the standard 90-minute tutorial session duration when unavailable.
 */
export function resolveBookingSlotDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number {
  const start = parseHhMmToMinutes(startTime);
  const end = parseHhMmToMinutes(endTime);
  if (start === null || end === null || end <= start) return 90;
  return end - start;
}

/**
 * Summarizes package quota and booking eligibility for a study group.
 */
export function getGroupQuotaSummary(group: BookingGroupLike | null | undefined): GroupQuotaSummary {
  if (!group) {
    return {
      total: 0,
      used: 0,
      remaining: 0,
      isZeroQuota: true,
      isExhausted: true,
      isInactive: false,
      canBook: false,
    };
  }

  const total = typeof group.totalQuotaSessions === "number" ? group.totalQuotaSessions : 15;
  const used = typeof group.usedQuotaSessions === "number" ? group.usedQuotaSessions : 0;
  const remaining = Math.max(0, total - used);
  const isZeroQuota = total <= 0;
  const isExhausted = !isZeroQuota && remaining <= 0;
  const isInactive = Boolean(group.status && group.status !== "active");

  return {
    total,
    used,
    remaining,
    isZeroQuota,
    isExhausted,
    isInactive,
    canBook: !isZeroQuota && !isExhausted && !isInactive,
  };
}

function extractSlotCourseAllowlist(slot: BookingSlotLike | null | undefined): Set<string> | null {
  if (!slot) return null;
  if (Array.isArray(slot.matchedCourseIds)) {
    return new Set(
      slot.matchedCourseIds
        .map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))
        .filter(Boolean),
    );
  }
  if (typeof slot.courseId === "string" && slot.courseId.trim()) {
    return new Set([slot.courseId.trim().toLowerCase()]);
  }
  const tutorCourses = slot.tutor?.tutorCourses;
  if (Array.isArray(tutorCourses) && tutorCourses.length > 0) {
    const ids = tutorCourses
      .map((entry) => (entry?.courseId ?? entry?.course?.id ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (ids.length > 0) return new Set(ids);
  }
  return null;
}

/**
 * Returns all courses linked to the group alongside the subset that the slot's
 * tutor is actually certified/assigned to teach.
 */
export function getEligibleCoursesForGroupAndSlot(
  group: BookingGroupLike | null | undefined,
  slot: BookingSlotLike | null | undefined,
): {
  linkedCourses: BookingCourseOption[];
  eligibleCourses: BookingCourseOption[];
} {
  const linkedById = new Map<string, BookingCourseOption>();
  for (const entry of group?.courses ?? []) {
    const course = entry?.course ?? entry;
    const id = (course?.id ?? entry?.courseId ?? "").trim();
    if (!id) continue;
    const normalizedId = id.toLowerCase();
    const title = (course?.title ?? course?.name ?? id).trim() || id;
    if (!linkedById.has(normalizedId)) {
      linkedById.set(normalizedId, { id, title });
    }
  }

  const linkedCourses = Array.from(linkedById.values());
  const allowlist = extractSlotCourseAllowlist(slot);
  if (!allowlist) {
    return { linkedCourses, eligibleCourses: linkedCourses };
  }

  const eligibleCourses = linkedCourses.filter((course) => allowlist.has(course.id.toLowerCase()));
  return { linkedCourses, eligibleCourses };
}

/**
 * Picks the best default group when opening the booking dialog: keeps a valid
 * current selection, otherwise prefers an active group with remaining quota and
 * at least one course taught by the slot's tutor.
 */
export function pickDefaultGroupId(
  groups: readonly BookingGroupLike[],
  slot: BookingSlotLike | null | undefined,
  currentGroupId?: string,
): string {
  if (groups.length === 0) return "";
  if (currentGroupId && groups.some((group) => group.id === currentGroupId)) {
    const existing = groups.find((group) => group.id === currentGroupId);
    if (existing) {
      const quota = getGroupQuotaSummary(existing);
      const { eligibleCourses } = getEligibleCoursesForGroupAndSlot(existing, slot);
      if (quota.canBook && eligibleCourses.length > 0) return existing.id;
    }
  }

  const bookableWithMatch = groups.find((group) => {
    const quota = getGroupQuotaSummary(group);
    if (!quota.canBook) return false;
    return getEligibleCoursesForGroupAndSlot(group, slot).eligibleCourses.length > 0;
  });
  if (bookableWithMatch) return bookableWithMatch.id;

  const bookable = groups.find((group) => getGroupQuotaSummary(group).canBook);
  if (bookable) return bookable.id;

  return groups[0]?.id ?? "";
}
