export function matchesScheduleCourse(courseId: string | null | undefined, selectedId: string, compatibleIds: readonly string[] = []) {
  if (!courseId) return false;
  return compatibleIds.includes(selectedId) ? compatibleIds.includes(courseId) : courseId === selectedId;
}
