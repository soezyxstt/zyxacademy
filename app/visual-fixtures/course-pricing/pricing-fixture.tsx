"use client";
import { SettingsTab } from "@/components/admin/course-detail/settings-tab";
import { StudentOnboardingView } from "@/components/dashboard/student-onboarding-view";
import { ChapterOutlineList } from "@/components/course/chapter-outline-list";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { CourseCatalogClient } from "@/app/(student)/courses/course-catalog-client";
import { StudentCourseOverviewView } from "@/components/course/student-course-overview-view";
import type { CoursePricing } from "@/lib/student/course-pricing";

const prices: CoursePricing[] = [
  { category: "free", startsAt: null, endsAt: null },
  { category: "premium", startsAt: null, endsAt: null },
  { category: "limited_time_free", startsAt: new Date("2030-01-02T00:00:00Z"), endsAt: new Date("2030-01-03T00:00:00Z") },
  { category: "limited_time_free", startsAt: new Date("2029-12-31T00:00:00Z"), endsAt: new Date("2030-01-02T00:00:00Z") },
  { category: "limited_time_free", startsAt: new Date("2029-12-29T00:00:00Z"), endsAt: new Date("2029-12-31T00:00:00Z") },
];
const names = ["Free course", "Premium course", "Upcoming course", "Active course", "Expired course"];
const courses = prices.map((pricing, i) => ({ id: `fixture-${i}`, title: names[i], category: "TPB", description: "", pricing, chapterCount: 1, materialCount: 1, quizCount: 1, materialsCount: 1, quizzesCount: 1, tryoutsCount: 1 }));
export function CoursePricingFixture() {
  return <main className="space-y-8 p-4" data-testid="pricing-fixture">
    <section><h1>Admin</h1><CoursesDashboard initialCourses={courses} /></section>
    <section><h2>Settings</h2><SettingsTab course={courses[3]} /></section>
    <section><h2>Dashboard</h2><StudentOnboardingView userName="Student" catalogCourses={courses.map((course) => ({ ...course, freeChapters: [], freeMaterialCount: 1, completedFreeMaterialCount: 0, freeQuizCount: 1, firstIncompleteMaterialId: null }))} /></section>
    <section><h2>Catalog</h2><CourseCatalogClient groups={[{ jurusan: "TPB", isStudentMajor: false, courses }]} /></section>
    <section><h2>Overview</h2><StudentCourseOverviewView course={{ ...courses[3], description: "" }} hasFullContentAccess highlights={<p>Unlocked learning</p>} chapterOutline={<ChapterOutlineList chapters={[{ id: "one", title: "Bab 1", number: 1, completionPercent: 0, completed: false, hasMaterial: true, href: "/courses/fixture-3/material/one" }]} />} /></section>
    <section><h2>Locked overview</h2><StudentCourseOverviewView course={{ ...courses[1], description: "" }} hasFullContentAccess={false} highlights={null} chapterOutline={<ChapterOutlineList chapters={[{ id: "two", title: "Bab 2", number: 2, completionPercent: 0, completed: false, hasMaterial: false }]} />} /></section>
  </main>;
}
