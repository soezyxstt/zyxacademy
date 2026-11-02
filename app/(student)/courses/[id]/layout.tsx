import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { MobileNavTitle } from "@/components/mobile-nav-title";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";

type Props = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CourseLayout({ children, params }: Props) {
  const { id } = await params;

  // Run session check and course lookup concurrently while preserving strict auth priority.
  const sessionPromise = getAuthSession();
  const coursePromise = getCourse(id).then(
    (data) => ({ ok: true as const, data }),
    (err: unknown) => ({ ok: false as const, error: err }),
  );

  const session = await sessionPromise;
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}`)}`);
  }

  const courseResult = await coursePromise;
  if (!courseResult.ok) {
    throw courseResult.error;
  }
  const course = courseResult.data;
  if (!course) notFound();

  return (
    <>
      <MobileNavTitle title={course.title} />
      {children}
    </>
  );
}
