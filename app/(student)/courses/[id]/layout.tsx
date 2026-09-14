import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MobileNavTitle } from "@/components/mobile-nav-title";
import { getCourse } from "@/lib/course-utils";

type Props = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CourseLayout({ children, params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  return (
    <>
      <MobileNavTitle title={course.title} />
      {children}
    </>
  );
}
