import { redirect } from "next/navigation";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  searchParams: Promise<{
    courseId?: string;
    courseSlug?: string;
    tags?: string;
  }>;
};

export default async function NewQuizPage({ searchParams }: Props) {
  try {
    await assertTutorOrAdmin();
  } catch {
    redirect("/");
  }

  const { courseId, courseSlug, tags } = await searchParams;
  const candidate = (courseId || courseSlug || "").trim();

  if (candidate) {
    const identity = await resolveCourseIdentity(candidate);
    if (identity) {
      const slug = getCanonicalCourseSlug(identity);
      const query = tags ? `?tags=${encodeURIComponent(tags)}` : "";
      redirect(`/admin/courses/${encodeURIComponent(slug)}/quizzes/new${query}`);
    }
  }

  redirect("/admin/courses");
}
