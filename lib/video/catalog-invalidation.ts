import "server-only";
import { revalidatePath } from "next/cache";

export function revalidateVideoPaths(courseId: string, courseSlug?: string) {
  const targets = new Set<string>([
    `/courses/${courseId}/video`,
    `/tutor/${courseId}/videos`,
    `/admin/courses/${courseId}/videos`,
  ]);

  if (courseSlug && courseSlug !== courseId) {
    targets.add(`/courses/${courseSlug}/video`);
    targets.add(`/admin/courses/${courseSlug}/videos`);
    targets.add(`/tutor/${courseSlug}/videos`);
  }

  for (const path of targets) {
    revalidatePath(path);
  }
}

