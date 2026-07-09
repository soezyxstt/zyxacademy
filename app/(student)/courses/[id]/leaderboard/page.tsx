import type { Metadata } from "next";
import { Lock, Trophy } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { pageTitle } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getCourse } from "@/lib/course-utils";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates, user } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return {
    title: pageTitle(course ? `${course.title} - Papan peringkat` : "Papan peringkat"),
    description: "Peringkat course berdasarkan kuis and tryout",
  };
}

function rankRowClass(rank: number) {
  if (rank === 1) return "bg-primary/[0.06] ring-1 ring-primary/15 hover:bg-primary/[0.09]";
  if (rank === 2) return "bg-muted/30 hover:bg-muted/45";
  if (rank === 3) return "bg-muted/20 hover:bg-muted/35";
  return "hover:bg-muted/25";
}

export default async function CourseLeaderboardPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;

 const isEnrolled = await checkEnrollment(id);

 if (!isEnrolled) {
 return (
 <CoursePageShell
 title={`Peringkat Kelas: ${course.title}`}
 description="Lihat peringkat Anda dan teman sekelas berdasarkan rata-rata nilai."
 icon={Trophy}
 >
 <Reveal>
 <div className={studentCardClass()}>
 <div className="flex items-start gap-3">
 <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
 <Lock className="size-5" />
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
 <p className="mt-1 text-body-sm text-muted-foreground">
 Aktifkan kelas untuk melihat peringkat dan skor gabungan.
 </p>
 </div>
 </div>
 <div className="mt-4">
 <EnrollmentForm />
 </div>
 </div>
 </Reveal>
 </CoursePageShell>
 );
 }

 // Phase J: dynamic AI quiz leaderboard ; direct query on completed attempts
 const aiRows = await db
 .select({
 studentId: studentQuizAttempts.studentId,
 studentName: user.name,
 attemptCount: sql<number>`count(*)`,
 avgScore: sql<number>`round(avg(${studentQuizAttempts.score}), 1)`,
 })
 .from(studentQuizAttempts)
 .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
 .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
 .where(
 and(
 eq(quizTemplates.courseId, id),
 eq(studentQuizAttempts.status, "completed"),
 ),
 )
 .groupBy(studentQuizAttempts.studentId, user.name)
 .orderBy(sql`avg(${studentQuizAttempts.score}) DESC`);

 const rankedRows = aiRows.map((r, i) => ({ ...r, rank: i + 1 }));

 return (
 <CoursePageShell
 title={`Peringkat Kelas: ${course.title}`}
 description="Lihat peringkat Anda dan teman sekelas berdasarkan rata-rata nilai."
 icon={Trophy}
 >
 <Reveal>
 <div className={studentCardClass("overflow-hidden !p-0")}>
 <div className="overflow-x-auto">
 <table className="w-full min-w-lg text-left text-body-sm">
 <thead>
 <tr className="border-b border-border bg-muted/30">
 <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Peringkat
 </th>
 <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Nama
 </th>
 <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Rata-rata skor kuis
 </th>
 <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Jumlah kuis
 </th>
 </tr>
 </thead>
 <tbody>
 {rankedRows.map((r) => (
 <tr key={r.studentId} className={cn("border-b border-border/70 last:border-0", rankRowClass(r.rank))}>
 <td className="px-4 py-3 tabular-nums font-semibold text-foreground">{r.rank}</td>
 <td className="px-4 py-3 font-medium text-foreground">{r.studentName}</td>
 <td className="px-4 py-3 tabular-nums font-semibold text-primary">{r.avgScore}%</td>
 <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.attemptCount}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 {rankedRows.length === 0 ? (
 <p className="mt-6 text-body-md text-muted-foreground">
  Belum ada skor kuis untuk course ini. Selesaikan kuis untuk muncul di papan peringkat.
 </p>
 ) : null}
 </Reveal>
 </CoursePageShell>
 );
}
