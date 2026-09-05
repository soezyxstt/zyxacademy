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
import { ApplicationPage } from "@/components/application-page";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
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
    <ApplicationPage>
      <PageHeader
        title="Pengajaran"
        icon={GraduationCap}
        divider={false}
      />

      <AdminStatStrip>
        <AdminStatStripItem
          label="Kelas ditugaskan"
          value={courseList.length}
          icon={BookOpen}
          tone="brand"
        />
        <AdminStatStripItem
          label="Siswa aktif"
          value={totalStudents}
          icon={Users}
          tone="brand-secondary"
        />
      </AdminStatStrip>

      <Link
        href="/tutor/schedule"
        className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <CalendarDays className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold text-foreground">
            Jadwal tutorial
          </span>
          <span className="block truncate text-body-xs text-muted-foreground">
            Kelola jadwal dan sesi kelompok
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-brand-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-body-base font-bold text-foreground">Kelas Anda</h2>
          <span className="text-body-xs text-muted-foreground">{courseList.length} kelas</span>
        </div>

        {courseList.length === 0 ? (
          <div className="border-y border-dashed border-border">
            <AdminEmptyState
              icon={GraduationCap}
              title="Belum ada kelas yang ditugaskan"
              description="Kelas dari admin akan muncul di sini."
            />
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {courseList.map((course) => {
              const courseHref = `/tutor/${course.courseId}`;

              return (
                <article key={course.courseId} className="space-y-3 py-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <Link
                      href={courseHref}
                      className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p className="truncate text-body-base font-semibold text-foreground">
                        {course.title}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        {course.enrolledCount} siswa aktif
                      </p>
                    </Link>
                    <Link
                      href={courseHref}
                      className="inline-flex shrink-0 items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ringkasan / Analitik
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                  <nav
                    aria-label={`Navigasi ${course.title}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-xs font-semibold"
                  >
                    <Link
                      href={`${courseHref}/participants`}
                      className="text-muted-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Peserta & Kelompok
                    </Link>
                    <Link
                      href={`${courseHref}/quizzes`}
                      className="text-muted-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Kuis
                    </Link>
                    <Link
                      href={`${courseHref}/live`}
                      className="text-muted-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Kuis Langsung
                    </Link>
                    <Link
                      href={`${courseHref}/quizzes/grading`}
                      className="text-muted-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Penilaian Kuis
                    </Link>
                    <Link
                      href={`${courseHref}/grading`}
                      className="text-muted-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Penilaian Tryout
                    </Link>
                  </nav>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </ApplicationPage>
  );
}
