"use client";

import { useEffect, useState } from "react";
import StudentCoursesLoading from "@/app/(student)/courses/loading";
import type { CatalogCourseItem, CourseGroup } from "@/app/(student)/courses/course-catalog-client";
import { StudentCourseCatalogView } from "@/components/course/student-course-catalog-view";
import { StudentMobileBottomNav } from "@/components/navigation/student/student-mobile-bottom-nav";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { PREMIUM_PRICING } from "@/lib/student/course-pricing";

const defaults = { description: "", materialsCount: 0, quizzesCount: 0, tryoutsCount: 0, pricing: PREMIUM_PRICING };
const tpbCourses: CatalogCourseItem[] = [
  { ...defaults, id: "bk1101", title: "Berpikir Komputasi", category: "TPB", hasFullContentAccess: true },
  { ...defaults, id: "fi1101", title: "Fisika Dasar I", category: "TPB", materialsCount: 1, hasFullContentAccess: false },
  { ...defaults, id: "ma1101", title: "Matematika I", category: "TPB", materialsCount: 6, quizzesCount: 2, hasFullContentAccess: true },
  {
    ...defaults,
    id: "ma1102",
    title: "Matematika Lanjut untuk Sains dan Rekayasa",
    category: "TPB",
    tryoutsCount: 1,
    hasFullContentAccess: true,
    pricing: { category: "limited_time_free", startsAt: new Date("2030-01-01T00:00:00Z"), endsAt: new Date("2030-01-03T00:00:00Z") },
  },
];
const groups: CourseGroup[] = [
  { jurusan: "TPB", isStudentMajor: false, courses: tpbCourses },
  { jurusan: "PKA", isStudentMajor: false, courses: [{ ...defaults, id: PKA_COURSE_ID, title: "Tutorial PKA", category: "PKA", hasFullContentAccess: false }] },
];
const experience: StudentExperienceAdapter = {
  mode: "demo",
  pathname: "/courses",
  courseHref: (id) => `/courses/${id}`,
  route: (view) => `/${view}`,
  baseline: [],
  selectedCourseId: null,
  overlay: null,
  ready: true,
};

export function CourseCatalogVisualFixture({ loading }: { loading: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return (
    <StudentExperienceProvider value={experience}>
      <main id="main-content" data-catalog-fixture-ready={ready ? "true" : undefined}>
        {loading ? <StudentCoursesLoading /> : (
          <StudentCourseCatalogView groups={groups} studentTargetCategory={null} whatsappHref="https://wa.me/620000000000" />
        )}
      </main>
      <StudentMobileBottomNav />
    </StudentExperienceProvider>
  );
}
