import type { NativeOfflineLibrarySnapshot } from "./library-contract";

/** Metadata has its own lease because a course can expire before the session. */
export function visibleOfflineLibrary(
  snapshot: NativeOfflineLibrarySnapshot | null,
  now = Date.now(),
): NativeOfflineLibrarySnapshot | null {
  if (!snapshot || snapshot.accessValidUntil <= now) return null;
  const courses = snapshot.courses.filter(course =>
    Math.min(snapshot.accessValidUntil, course.accessValidUntil ?? snapshot.accessValidUntil) > now,
  );
  const courseIds = new Set(courses.map(course => course.id));
  return {
    ...snapshot,
    courses,
    materials: snapshot.materials.filter(material => courseIds.has(material.courseId)
      && Math.min(snapshot.accessValidUntil, material.accessValidUntil ?? snapshot.accessValidUntil) > now),
  };
}
