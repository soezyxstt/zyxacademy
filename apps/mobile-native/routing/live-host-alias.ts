export const legacyLiveHostPattern = "/courses/[id]/live/host";

export function tutorLiveDestination(courseId: string) {
  if (!courseId || courseId === "." || courseId === ".." || /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(courseId)) return null;
  return `/tutor/${encodeURIComponent(courseId)}/live`;
}
