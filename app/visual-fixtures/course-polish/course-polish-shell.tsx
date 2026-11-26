"use client";

import type { ReactNode } from "react";
import { CourseMobileTabNav } from "@/components/navigation/student/course-mobile-tab-nav";
import { StudentMobileBottomNav } from "@/components/navigation/student/student-mobile-bottom-nav";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";

export function CoursePolishShell({ course, section, children }: { course: { id: string; title: string }; section: string; children: ReactNode }) {
  const coursePath = `/courses/${course.id}`;
  const experience: StudentExperienceAdapter = {
    mode: "demo",
    pathname: section === "overview" ? coursePath : `${coursePath}/${section}`,
    courseHref: (id) => `/courses/${id}`,
    route: (view) => `${coursePath}/${view}`,
    baseline: [], selectedCourseId: course.id, overlay: null, ready: true,
  };

  return (
    <StudentExperienceProvider value={experience}>
      <CourseMobileTabNav courseId={course.id} courseTitle={course.title} />
      <main id="main-content">{children}</main>
      <StudentMobileBottomNav />
    </StudentExperienceProvider>
  );
}
