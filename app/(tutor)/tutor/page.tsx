import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { getTutorCourseList } from "@/lib/cohort-analytics";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Teaching"),
  description: "Analitik cohort dan manajemen kelas untuk tutor Zyx Academy.",
};

export default async function TutorPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const role = (session.user as { role?: string | null }).role;
  const isAdmin = role === "admin";

  const courseList = await getTutorCourseList(session.user.id, isAdmin);

  const totalStudents = courseList.reduce((sum, course) => sum + course.enrolledCount, 0);

  return (
    <div className="max-w-4xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="font-heading text-h5 font-bold text-foreground">Teaching</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Select a course to view cohort analytics.
        </p>
        <div className="mt-5 flex flex-wrap gap-6 text-body-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-brand-primary" />
            <span className="font-semibold text-foreground">{courseList.length}</span>
            <span className="text-muted-foreground">courses</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-tertiary-1" />
            <span className="font-semibold text-foreground">{totalStudents}</span>
            <span className="text-muted-foreground">students</span>
          </div>
        </div>
      </div>

      {courseList.length === 0 ? (
        <p className="mt-8 text-body-sm text-muted-foreground">No courses assigned.</p>
      ) : (
        <div className="divide-y divide-border border-b border-border">
          {courseList.map((course) => (
            <Link
              key={course.courseId}
              href={`/tutor/${course.courseId}`}
              className="grid gap-3 py-4 transition-colors duration-150 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
            >
              <div className="min-w-0">
                <p className="truncate text-body-base font-medium text-foreground">
                  {course.title}
                </p>
                <p className="text-body-sm text-muted-foreground">
                  {course.enrolledCount} enrolled
                </p>
              </div>
              <div className="flex items-center gap-3 text-body-sm font-semibold text-brand-primary">
                <span>Open analytics</span>
                <ArrowRight className="size-4 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
