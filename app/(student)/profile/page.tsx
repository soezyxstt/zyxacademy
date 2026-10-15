import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, GraduationCap, CalendarDays, User2, ShieldCheck, ClipboardList, Edit3 } from "lucide-react";

import { ShellPage } from "@/components/shell-page";
import { createMetadata, pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import {
 courses,
 progress,
 submissions,
 bookings,
 tutorSlots,
 groupMembers,
 groups,
 user as userTable,
} from "@/db/schema";
import { listStudentCourses, listStudentEnrollments } from "@/lib/student/course-catalog";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";

export const metadata: Metadata = createMetadata({
  title: "Profil Pengguna",
  description: "Profil akademis, statistik belajar, kelompok belajar, dan jadwal tutorial Anda di Zyx Academy.",
  path: "/profile",
});


/**
 * Server-rendered profile page displaying student user info, ITB academic data, course enrollments, and activity statistics.
 */
export default async function ProfilePage() {
 const h = await headers();
 const session = await auth.api.getSession({ headers: h });
 
 if (!session?.user) {
 redirect("/sign-in?next=/profile");
 }

 const user = session.user;
 const now = new Date();

 let activeEnrollments: any[] = [];
 let completedCount = 0;
 let submissionCount = 0;
 let averageScore: number | null = null;
 let userGroups: any[] = [];
 let studentBookings: any[] = [];

 try {
 if (process.env.NODE_ENV === "development" && user.role === "admin") {
 const all = await listStudentCourses();
 activeEnrollments = all.map((c) => ({
 id: c.id,
 title: c.title,
 category: c.category,
 enrolledAt: now,
 expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
 }));
 } else {
 activeEnrollments = await listStudentEnrollments(user.id);
 }
 } catch (err) {
 console.error("Failed to fetch enrollments:", err);
 }

 try {
 const [progressRes, articleGroups] = await Promise.all([
 db
 .select({ materialId: progress.materialId })
 .from(progress)
 .where(and(eq(progress.userId, user.id), eq(progress.status, "completed"))),
 Promise.all(activeEnrollments.map((course) => getCanonicalPublishedArticlesForCourse(course.id, user.id))),
 ]);
 const completedIds = new Set(progressRes.flatMap((row) => row.materialId ? [row.materialId] : []));
 for (const article of articleGroups.flat()) {
 if (article.completed) completedIds.add(article.id);
 }
 completedCount = completedIds.size;
 } catch (err) {
 console.error("Failed to fetch progress:", err);
 }

 try {
 const submissionsRes = await db
 .select()
 .from(submissions)
 .where(eq(submissions.userId, user.id));
 submissionCount = submissionsRes.length;
 const graded = submissionsRes.filter((s) => s.score !== null);
 averageScore = graded.length > 0
 ? Math.round(graded.reduce((acc, curr) => acc + (curr.score || 0), 0) / graded.length)
 : null;
 } catch (err) {
 console.error("Failed to fetch submissions:", err);
 }

 try {
 userGroups = await db
 .select({
 id: groups.id,
 name: groups.name,
 joinedAt: groupMembers.joinedAt,
 })
 .from(groupMembers)
 .innerJoin(groups, eq(groupMembers.groupId, groups.id))
 .where(eq(groupMembers.userId, user.id));
 } catch (err) {
 console.error("Failed to fetch groups:", err);
 }

 try {
 studentBookings = await db
 .select({
 id: bookings.id,
 bookedAt: bookings.bookedAt,
 courseTitle: courses.title,
 dayOfWeek: tutorSlots.dayOfWeek,
 startTime: tutorSlots.startTime,
 endTime: tutorSlots.endTime,
 tutorName: userTable.name,
 })
 .from(bookings)
 .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
 .innerJoin(courses, eq(bookings.courseId, courses.id))
 .innerJoin(userTable, eq(tutorSlots.tutorId, userTable.id))
 .where(eq(bookings.studentId, user.id));
 } catch (err) {
 console.error("Failed to fetch bookings:", err);
 }

 let dbUser: any = null;
 try {
 const [row] = await db
 .select()
 .from(userTable)
 .where(eq(userTable.id, user.id))
 .limit(1);
 dbUser = row;
 } catch (err) {
 console.error("Failed to fetch user profile:", err);
 }

 return (
 <ShellPage title="Profil Saya">
 <div className="w-full pb-12">
 {/* Profile Header */}
 <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 md:gap-8">
 <div className="relative size-24 md:size-28 shrink-0">
 {user.image ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img
 src={user.image}
 alt={user.name}
 className="size-full rounded-full object-cover border-2 border-background ring-4 ring-brand-primary/20 shadow-sm"
 referrerPolicy="no-referrer"
 />
 ) : (
 <span className="flex size-full items-center justify-center rounded-full bg-brand-primary text-h5 font-bold text-white shadow-sm ring-4 ring-brand-primary/20 border-2 border-background">
 {user.name?.charAt(0)?.toUpperCase() ?? "?"}
 </span>
 )}
 <span
 className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-status-success ring-2 ring-background"
 title="Akun Google Aktif"
 />
 </div>

 <div className="flex-1 text-center sm:text-left min-w-0">
 <span className="inline-flex items-center gap-1 rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2.5 py-0.5 text-[10px] font-semibold text-brand-primary uppercase tracking-wider">
 {user.role || "student"}
 </span>

 <h2 className="font-heading text-h5 font-bold tracking-tight text-foreground mt-2 break-words">
 {user.name}
 </h2>

 <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-4 gap-y-2 mt-3 text-body-sm text-muted-foreground">
 <span className="flex items-center gap-1.5 min-w-0">
 <Mail className="size-4 text-muted-foreground/75 shrink-0" />
 <span className="truncate">{user.email}</span>
 </span>
 <span className="flex items-center gap-1.5 text-status-success font-medium shrink-0">
 <ShieldCheck className="size-4 shrink-0" />
 Google terhubung
 </span>
 <Link
 href="/profile/edit"
 className="flex items-center gap-1.5 text-brand-primary font-semibold hover:underline shrink-0"
 >
 <Edit3 className="size-4 shrink-0" />
 Edit profil
 </Link>
 <Link
 href="/profile/reflections"
 className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium hover:underline shrink-0"
 >
 <ClipboardList className="size-4 shrink-0" />
 Refleksi mingguan
 </Link>
 </div>
 </div>
 </div>

 {/* Stats Section: Cardless, Dividers Grid */}
 <div className="rounded-xl border border-border bg-card p-4 my-5 grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="flex flex-col items-center md:items-start md:px-4 first:pl-0">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {activeEnrollments.length}
 </span>
 <span className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">
 Kelas Aktif
 </span>
 </div>

 <div className="flex flex-col items-center md:items-start md:px-4">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {completedCount}
 </span>
 <span className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">
 Materi Selesai
 </span>
 </div>

 <div className="flex flex-col items-center md:items-start md:px-4">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {submissionCount}
 </span>
 <span className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">
 Ujian Selesai
 </span>
 </div>

 <div className="flex flex-col items-center md:items-start md:px-4 last:pr-0">
 <span className="font-heading text-h5 font-bold text-brand-secondary">
 {averageScore !== null ? `${averageScore}%` : "-"}
 </span>
 <span className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">
 Rata-rata Nilai
 </span>
 </div>
 </div>

      {/* Main Content Info Row */}
      <div className="grid gap-8 lg:grid-cols-12 mt-8">
        {/* Left Side: Learning and Bookings */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Classes list */}
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
              <GraduationCap className="size-5 text-brand-primary shrink-0" />
              Kelas yang Diikuti
            </h3>
            {activeEnrollments.length > 0 ? (
              <div className="divide-y divide-border/60">
                {activeEnrollments.map((course) => (
                  <div key={course.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 border-b border-border/40 last:border-b-0 text-left">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap text-left">
                        <span className="inline-flex rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20">
                          {course.category}
                        </span>
                        <span className="text-body-xs text-muted-foreground">
                          Terdaftar: {new Date(course.enrolledAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <h4 className="font-heading text-body-sm font-semibold text-foreground mt-1.5 truncate text-left">
                        {course.title}
                      </h4>
                    </div>
                    <Link
                      href={`/courses/${course.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted/70 hover:border-border-strong transition-colors h-8 shrink-0"
                    >
                      Buka Kelas
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2 italic border-t border-border/40">
                Belum ada kelas aktif. Minta token kelas dari admin.
              </p>
            )}
          </div>

          {/* Bookings list */}
          <div className="border-t border-border/60 pt-6">
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
              <CalendarDays className="size-5 text-brand-secondary shrink-0" />
              Jadwal Tutorial Mendatang
            </h3>
            {studentBookings.length > 0 ? (
              <div className="divide-y divide-border/60">
                {studentBookings.map((booking) => (
                  <div key={booking.id} className="flex items-start gap-3 py-3">
                    <div className="size-8 shrink-0 flex items-center justify-center rounded bg-brand-secondary/10 text-brand-secondary">
                      <User2 className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-body-sm font-semibold text-foreground truncate">
                        Tutorial {booking.courseTitle}
                      </h4>
                      <p className="text-body-xs text-muted-foreground mt-0.5 truncate">
                        Tutor: <span className="font-medium text-foreground">{booking.tutorName}</span>
                      </p>
                      <p className="text-body-xs font-semibold text-brand-secondary mt-2 flex items-center gap-1">
                        <span className="capitalize">{booking.dayOfWeek}</span>, {booking.startTime} - {booking.endTime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2 italic">
                Belum ada tutorial minggu ini.
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Account details and groups */}
        <div className="lg:col-span-5 space-y-6">
          {/* ITB Academic Profile */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-body-base font-bold text-foreground">
                Profil Akademis ITB
              </h3>
              <Link
                href="/profile/edit"
                className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
              >
                <Edit3 className="size-3.5" />
                Edit profil
              </Link>
            </div>
            <dl className="text-body-sm divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Fakultas / Sekolah</dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.faculty || <span className="text-muted-foreground font-normal italic">Belum diisi</span>}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Jurusan / Program Studi</dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.major || <span className="text-muted-foreground font-normal italic">Belum diisi</span>}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Tahun Masuk (Angkatan)</dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.entryYear ? `${dbUser.entryYear}` : <span className="text-muted-foreground font-normal italic">Belum diisi</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Google Identity info */}
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground mb-3">
              Akun Google
            </h3>
            <dl className="text-body-sm divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Hubungan Akun</dt>
                <dd className="font-semibold text-foreground flex items-center gap-1.5">
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                  </svg>
                  Google
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Status Email</dt>
                <dd className="font-semibold text-status-success">
                  Terverifikasi
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground">Tanggal Terdaftar</dt>
                <dd className="font-semibold text-foreground">
                  {new Date(user.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                </dd>
              </div>
              {user.lastActivityAt && (
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-muted-foreground">Aktivitas Terakhir</dt>
                  <dd className="font-semibold text-foreground">
                    {new Date(user.lastActivityAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </dd>
                </div>
              )}
            </dl>
          </div>

 {/* Groups list */}
 <div>
 <h3 className="font-heading text-body-base font-semibold text-foreground mb-4">
 Kelompok Belajar
 </h3>
 {userGroups.length > 0 ? (
 <div className="divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
 {userGroups.map((grp) => (
 <div key={grp.id} className="py-3 flex items-center justify-between gap-4">
 <span className="font-semibold text-body-sm text-foreground">
 {grp.name}
 </span>
 <span className="text-body-xs text-muted-foreground">
 Bergabung: {new Date(grp.joinedAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
 </span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-body-xs text-muted-foreground italic pt-2 border-t border-border/40">
 Kelompok dibuat saat aktivasi token kelas.
 </p>
 )}
 </div>
 </div>
 </div>
 </div>
 </ShellPage>
 );
}
