import { redirect } from "next/navigation";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { resolveCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  searchParams: Promise<{ courseId?: string; tags?: string }>;
};

export default async function AIQuizzesPage({ searchParams }: Props) {
  try {
    await assertTutorOrAdmin();
  } catch {
    redirect("/");
  }

  const { courseId } = await searchParams;

  if (courseId) {
    const identity = await resolveCourseIdentity(courseId);
    if (identity) {
      const courseSlug = getCanonicalCourseSlug(identity);
      redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/quizzes`);
    }
  }

  redirect("/admin/courses");
}
