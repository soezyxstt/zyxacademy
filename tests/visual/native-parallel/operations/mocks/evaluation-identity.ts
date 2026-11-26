const identity = { slug: "mekanika-dasar", primaryId: "mekanika-dasar", canonicalId: "mekanika-dasar" };

export async function resolveCourseIdentity(identifier: string) {
  return ["mekanika-dasar", "mekanika-legacy"].includes(identifier.trim().toLowerCase()) ? identity : null;
}

export async function resolveQuizCourseIdentity(id: string) {
  return id.trim() === "kuis-energi" ? identity : null;
}

export function getCanonicalCourseSlug(course: typeof identity) {
  return course.canonicalId || course.primaryId || course.slug;
}
