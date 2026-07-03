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

  // The PKA course has its own static route tree with a reduced tab set;
  // any generic sub-route (quiz, flashcard, tryout, ...) falls back here and
  // is sent to the PKA course home instead.
  if (id === PKA_COURSE_ID) redirect(`/courses/${PKA_COURSE_ID}`);

  const course = await getCourse(id);
  if (!course) notFound();

  return <>{children}</>;
}


