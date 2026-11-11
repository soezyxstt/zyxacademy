import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { resolveQuizCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminQuizInsightDetailPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { id } = await params;
  if (!id) {
    redirect("/admin/courses");
  }

  const identity = await resolveQuizCourseIdentity(id);
  if (!identity) {
    notFound();
  }

  const courseSlug = getCanonicalCourseSlug(identity);
  redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/analytics/${encodeURIComponent(id)}`);
}
