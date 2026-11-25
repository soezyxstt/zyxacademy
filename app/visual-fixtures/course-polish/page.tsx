import { notFound } from "next/navigation";
import { ChapterOutlineList } from "@/components/course/chapter-outline-list";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { StudentCourseOverviewView } from "@/components/course/student-course-overview-view";
import { CoursePolishShell } from "./course-polish-shell";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  const course = { id: "fixture-math", title: "Matematika I", description: null };
  const coursePath = `/courses/${course.id}`;

  return (
    <CoursePolishShell course={course} section="overview">
      <StudentCourseOverviewView
        course={course}
        hasFullContentAccess
        highlights={
          <CoursePrimaryActions
            reading={{ tag: "DOKUMEN", title: "Limit fungsi", meta: "6 materials", actionLabel: "Read", href: `${coursePath}/material` }}
            quiz={{ tag: "KUIS", title: "Kuis limit", meta: "10 questions", actionLabel: "Practice", href: `${coursePath}/quiz` }}
            schedule={{ tag: "JADWAL", title: "Tutorial limit", meta: "Friday, 15:00 WIB", actionLabel: "Schedule", href: "/dashboard/schedule" }}
            className="mb-6"
          />
        }
        chapterOutline={
          <ChapterOutlineList chapters={[
            { id: "functions", title: "Fungsi dan grafik", number: 1, completed: true, completionPercent: 100, hasMaterial: true, href: `${coursePath}/material/functions` },
            { id: "limit", title: "Limit fungsi dan kontinuitas", number: 2, completed: false, completionPercent: 40, hasMaterial: true, href: `${coursePath}/material/limit` },
            { id: "derivatives", title: "Turunan", number: 3, completed: false, completionPercent: 0, hasMaterial: false },
          ]} />
        }
      />
    </CoursePolishShell>
  );
}
