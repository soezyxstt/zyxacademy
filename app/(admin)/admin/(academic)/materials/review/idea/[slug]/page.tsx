import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveBundleCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function IdeaReviewDetailPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug: bundleId } = await params;
  if (!bundleId) {
    redirect("/admin/courses");
  }

  const identity = await resolveBundleCourseIdentity(bundleId, "idea");
  if (!identity) {
    notFound();
  }

  const courseSlug = getCanonicalCourseSlug(identity);
  redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/review/idea/${encodeURIComponent(bundleId)}`);
}
