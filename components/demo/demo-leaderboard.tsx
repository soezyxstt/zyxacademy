"use client";
import { useSearchParams } from "next/navigation";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { StudentLeaderboardControls } from "@/components/student-leaderboard-controls";
import { StudentAcademicLeaderboardView } from "@/components/student-academic-leaderboard-view";
import { LeaderboardResults } from "@/components/gamification/leaderboard-results";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale } from "@/lib/i18n/client";
import { demoIdentity, demoOwnIdentity, demoRankings } from "@/lib/demo/gamification";
import { useDemoGamification } from "./demo-gamification-provider";

type Row = { rank: number; name: string; avgScore: number; attempts: number; studentId?: string };
export function DemoLeaderboard({ rankings }: { rankings: Record<string, Row[]> }) {
  const params = useSearchParams();
  const experience = useStudentExperience();
  const { locale } = useAppLocale();
  const { state } = useDemoGamification();
  const tab = params.get("tab") === "academic" || (params.get("tab") !== "rank" && params.get("academic") === "1") ? "academic" : "rank";
  const periodParam = params.get("period");
  const period = periodParam === "week" || periodParam === "month" ? periodParam : "all";
  const scope = params.get("scope") === "following" ? "following" : "global";
  const courses = experience.courses ?? [];
  const courseId = courses.some(course => course.id === params.get("academicCourse")) ? params.get("academicCourse") ?? undefined : undefined;
  const visible = courseId ? courses.filter(course => course.id === courseId) : courses;
  const withIdentities = Object.fromEntries(Object.entries(rankings).map(([id, rows]) => [id, rows.map(row => ({ ...row, identity: row.studentId === "fictional-demo-student" ? demoOwnIdentity(row.name, state.equipped) : demoIdentity(row.name) ?? null }))]));
  const href = (path: string) => experience.href?.(path) ?? path;
  return <StudentLeaderboardView title={locale === "en" ? "Leaderboard" : "Papan peringkat"}>
    <StudentLeaderboardControls tab={tab} period={period} scope={scope} courseId={courseId} courses={courses} locale={locale} courseParam="academicCourse" legacyAcademicParam="academic">
      {tab === "rank" ? <LeaderboardResults page={demoRankings(experience.account?.name ?? "Pelajar Demo", state.equipped.frame, period, scope, state.following)} period={period} scope={scope} locale={locale} basePath={href("/leaderboard")} showFilters={false} /> : <StudentAcademicLeaderboardView embedded href={href} allCourses={visible} leaderboardByCourse={withIdentities} />}
    </StudentLeaderboardControls>
  </StudentLeaderboardView>;
}
