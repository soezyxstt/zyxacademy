import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getCourse } from "@/lib/course-utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";

/**
 * Static segment for the Tutorial PKA course. Wins over /courses/[id] per
 * Next.js static-over-dynamic precedence, so this course gets its own tab set
 * while inheriting the regular (student) shell (sidebar + ambient background).
 */
export default async function PkaCourseLayout({ children }: { children: ReactNode }) {
  if (env.FEATURE_PKA !== "1") notFound();

  const course = await getCourse(PKA_COURSE_ID);
  if (!course) notFound();

  return <>{children}</>;
}
