import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  searchParams: Promise<{ courseId?: string }>;
};

export default async function AdminLeaderboardPage({ searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { courseId } = await searchParams;

  if (courseId) {
    const identity = await resolveCourseIdentity(courseId);
    if (identity) {
      const courseSlug = getCanonicalCourseSlug(identity);
      redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/leaderboard`);
    }
  }

  redirect("/admin/courses");
}
