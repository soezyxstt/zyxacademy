/**
 * Pure helpers for optional per-slot course selection on tutor availability slots.
 * When a slot has no explicit course restrictions (empty list), all active courses
 * assigned to the tutor remain eligible on that slot.
 */

export function normalizeSlotCourseIds(
  courseIds: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(courseIds) || courseIds.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of courseIds) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

/**
 * Toggles a course ID in the slot course selection state.
 * An empty array represents "all assigned courses". Selecting every available
 * course or clearing the last selected course normalizes back to [].
 */
export function toggleSlotCourseSelection(
  currentSelectedIds: readonly string[],
  targetCourseId: string,
  allAssignedCourseIds: readonly string[],
): string[] {
  const target = targetCourseId.trim();
  if (!target) return normalizeSlotCourseIds(currentSelectedIds);
  const targetKey = target.toLowerCase();
  const normalizedAssigned = normalizeSlotCourseIds(allAssignedCourseIds);
  const current = normalizeSlotCourseIds(currentSelectedIds);

  let next: string[];
  if (current.some((id) => id.toLowerCase() === targetKey)) {
    next = current.filter((id) => id.toLowerCase() !== targetKey);
  } else {
    next = [...current, target];
  }

  if (next.length === 0) return [];
  if (
    normalizedAssigned.length > 0 &&
    normalizedAssigned.every((id) => next.some((chosen) => chosen.toLowerCase() === id.toLowerCase()))
  ) {
    return [];
  }
  return next;
}

/**
 * Filters a tutor's eligible course IDs by optional per-slot course restrictions.
 * Supports optional canonical/legacy alias expansion so a restriction stored with
 * either a canonical or legacy ID matches both aliases.
 */
export function filterCourseIdsBySlotRestriction(
  tutorCourseIds: readonly string[],
  slotCourseIds: readonly string[] | null | undefined,
  expandAliases?: (courseId: string) => readonly string[],
): string[] {
  const restrictions = normalizeSlotCourseIds(slotCourseIds);
  if (restrictions.length === 0) return [...tutorCourseIds];

  const allowedLower = new Set<string>();
  for (const id of restrictions) {
    const lower = id.toLowerCase();
    allowedLower.add(lower);
    if (expandAliases) {
      for (const alias of expandAliases(id)) {
        const trimmed = alias.trim();
        if (trimmed) allowedLower.add(trimmed.toLowerCase());
      }
      if (lower !== id) {
        for (const alias of expandAliases(lower)) {
          const trimmed = alias.trim();
          if (trimmed) allowedLower.add(trimmed.toLowerCase());
        }
      }
    }
  }

  return tutorCourseIds.filter((id) => allowedLower.has(id.trim().toLowerCase()));
}

/**
 * Checks whether a target course (with any resolved canonical/legacy aliases) is
 * allowed on a slot with optional per-slot course restrictions.
 */
export function isCourseAllowedForSlot(
  courseIdsToCheck: readonly (string | null | undefined)[],
  slotCourseIds: readonly string[] | null | undefined,
): boolean {
  const restrictions = normalizeSlotCourseIds(slotCourseIds);
  if (restrictions.length === 0) return true;
  const allowedLower = new Set(restrictions.map((id) => id.toLowerCase()));
  return courseIdsToCheck.some(
    (id) => typeof id === "string" && id.trim().length > 0 && allowedLower.has(id.trim().toLowerCase()),
  );
}

export function isMissingTutorSlotCoursesTable(error: unknown): boolean {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current != null && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
    } else if (typeof current === "object") {
      const msg = (current as { message?: unknown }).message;
      if (typeof msg === "string") messages.push(msg);
    } else {
      messages.push(String(current));
    }
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  const combined = messages.join(" ");
  return /(?:no such table|relation\s+"?tutor_slot_courses"?\s+does not exist|tutor_slot_courses)/i.test(
    combined,
  ) && /(?:no such table|does not exist)/i.test(combined);
}
