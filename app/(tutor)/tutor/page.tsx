import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ArrowRight, BookOpen, Users, CalendarDays, GraduationCap } from "lucide-react";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { listTutorAccessibleCourses } from "@/lib/auth/tutor-access";
import { db } from "@/db";
import { courses, enrollments, mataKuliah } from "@/db/schema";
import { and, count, gt, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Pengajaran"),
  description: "Analitik cohort dan manajemen kelas untuk tutor Zyx Academy.",
};

export default async function TutorPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (!isAuthorized) redirect("/");

  const accessible = await listTutorAccessibleCourses(session.user.id, { allowAdmin: false });
  const now = new Date();

  let courseList: Array<{ courseId: string; title: string; enrolledCount: number }> = [];

  if (accessible.length > 0) {
    const canonicalIds = accessible.map((c) => c.courseId);
    const legacyIds = accessible
      .map((c) => c.legacyCourseId ?? c.courseId)
      .filter((id): id is string => Boolean(id));

    const mkRows = await db
      .select({ id: mataKuliah.id, title: mataKuliah.title })
      .from(mataKuliah)
      .where(inArray(mataKuliah.id, canonicalIds));

    const legacyRows =
      legacyIds.length > 0
        ? await db
            .select({ id: courses.id, title: courses.title })
            .from(courses)
            .where(inArray(courses.id, legacyIds))
        : [];

    const mkMap = new Map(mkRows.map((m) => [m.id, m.title]));
    const legacyMap = new Map(legacyRows.map((l) => [l.id, l.title]));

    const allCheckedIds = Array.from(new Set([...canonicalIds, ...legacyIds]));
    const enrollmentRows = await db
      .select({ courseId: enrollments.courseId, n: count() })
      .from(enrollments)
      .where(and(inArray(enrollments.courseId, allCheckedIds), gt(enrollments.expiresAt, now)))
      .groupBy(enrollments.courseId);

    const enrollmentMap = new Map(enrollmentRows.map((e) => [e.courseId, e.n]));

    courseList = accessible.map((item) => {
      const title =
        mkMap.get(item.courseId) ??
        legacyMap.get(item.legacyCourseId ?? item.courseId) ??
        item.courseId;

      const enrolledCount =
        (enrollmentMap.get(item.courseId) ?? 0) +
        (item.legacyCourseId && item.legacyCourseId !== item.courseId
          ? enrollmentMap.get(item.legacyCourseId) ?? 0
          : 0);

      return {
        courseId: item.courseId,
        title,
        enrolledCount,
      };
    });
  }

  const totalStudents = courseList.reduce((sum, course) => sum + course.enrolledCount, 0);

  return (
    <div className="max-w-5xl px-6 py-8 space-y-6">
      <PageHeader
        title="Pengajaran"
        icon={GraduationCap}
        divider={false}
      />

      {/* Schedule Banner linking to /tutor/schedule */}
      <Link
        href="/tutor/schedule"
        className="flex items-center justify-between p-4 rounded-2xl border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 transition-colors shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-brand-primary text-white flex items-center justify-center shrink-0">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <p className="font-heading text-body-sm font-bold text-foreground">
              Kalender & Jadwal Tutorial
            </p>
            <p className="text-body-xs text-muted-foreground">
              Kelola slot ketersediaan 90 menit, sertifikasi mata kuliah, dan tutorial kelompok.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-body-xs font-semibold text-brand-primary shrink-0">
          <span>Buka Jadwal</span>
          <ArrowRight className="size-4" />
        </div>
      </Link>

      <div className="border-b border-border pb-6">
        <p className="text-body-sm text-muted-foreground">
          Pilih kelas untuk melihat analitik cohort.
        </p>
        <div className="mt-4 flex flex-wrap gap-6 text-body-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-brand-primary" />
            <span className="font-semibold text-foreground">{courseList.length}</span>
            <span className="text-muted-foreground">kelas</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-tertiary-1" />
            <span className="font-semibold text-foreground">{totalStudents}</span>
            <span className="text-muted-foreground">siswa</span>
          </div>
        </div>
      </div>

      {courseList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <AdminEmptyState
            icon={GraduationCap}
            title="Belum ada kelas yang ditugaskan"
            description="Kelas yang ditugaskan oleh admin kepada Anda akan muncul di sini."
          />
        </div>
      ) : (
        <div className="divide-y divide-border border-b border-border">
          {courseList.map((course) => (
            <div
              key={course.courseId}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3 rounded-lg"
            >
              <Link
                href={`/tutor/${course.courseId}`}
                className="min-w-0 transition-colors duration-150 hover:bg-muted/35"
              >
                <p className="truncate text-body-base font-medium text-foreground">
                  {course.title}
                </p>
                <p className="text-body-sm text-muted-foreground">
                  {course.enrolledCount} terdaftar
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm font-semibold text-brand-primary">
                <Link href={`/tutor/${course.courseId}/quizzes`} className="hover:underline">
                  Kuis
                </Link>
                <Link href={`/tutor/${course.courseId}/live`} className="hover:underline">
                  Kuis Langsung
                </Link>
                <Link href={`/tutor/${course.courseId}/grading`} className="hover:underline">
                  Penilaian
                </Link>
                <Link href={`/tutor/${course.courseId}`} className="inline-flex items-center gap-1.5 hover:underline">
                  Analitik
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
