import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { MobileNavTitle } from "@/components/mobile-nav-title";
import { getCourse } from "@/lib/course-utils";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Props = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CourseLayout({ children, params }: Props) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}`)}`);
  }

  const course = await getCourse(id);
  if (!course) notFound();

  return (
    <>
      <MobileNavTitle title={course.title} />
      {children}
    </>
  );
}
