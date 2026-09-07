import { notFound, redirect } from "next/navigation";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { resolveQuizCourseIdentity, getCanonicalCourseSlug } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnUrl?: string; courseSlug?: string; courseId?: string }>;
};

export default async function EditQuizPage({ params }: Props) {
  try {
    await assertTutorOrAdmin();
  } catch {
    redirect("/");
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
  redirect(`/admin/courses/${encodeURIComponent(courseSlug)}/quizzes/${encodeURIComponent(id)}/edit`);
}
