import "server-only";
import { revalidatePath } from "next/cache";

export function revalidateChapterPaths(courseIds: string[]) {
  revalidatePath("/admin/courses");
  // shortcut: layout patterns also invalidate other courses, narrow this when per-course tags cover nested reads.
  revalidatePath("/(admin)/admin/(academic)/courses/[slug]", "layout");
  revalidatePath("/(student)/courses/[id]", "layout");
  for (const id of new Set(courseIds)) {
    revalidatePath(`/admin/courses/${id}`);
    revalidatePath(`/courses/${id}`);
    revalidatePath(`/courses/${id}/material`);
  }
  revalidatePath("/dashboard");
}
