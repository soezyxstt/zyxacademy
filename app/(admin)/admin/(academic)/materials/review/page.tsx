import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { resolveCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  searchParams: Promise<{ courseId?: string; section?: string; tab?: string }>;
};

export default async function MaterialReviewPage({ searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { courseId, section, tab } = await searchParams;

  if (courseId) {
    const identity = await resolveCourseIdentity(courseId);
    if (identity) {
      const courseSlug = getCanonicalCourseSlug(identity);
      const params = new URLSearchParams();
      if (tab) params.set("tab", tab);
      else if (section) params.set("tab", section === "product" ? "product" : "idea");
      const queryString = params.toString() ? `?${params.toString()}` : "";
      redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/review${queryString}`);
    }
  }

  redirect("/admin/courses");
}
