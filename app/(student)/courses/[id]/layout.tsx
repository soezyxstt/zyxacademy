import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getCourse } from "@/lib/course-utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";

type Props = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CourseLayout({ children, params }: Props) {
  const { id } = await params;



  const course = await getCourse(id);
  if (!course) notFound();

  return <>{children}</>;
}


