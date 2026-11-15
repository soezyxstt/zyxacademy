import { Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { LeaderboardList } from "@/components/gamification/leaderboard-list";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { AdminEmptyState as AccessErrorState } from "@/components/admin/state-panels";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string; scope?: string; cursor?: string }> }) {
  const [query, locale] = await Promise.all([searchParams, getAppLocale()]);
  const t = await getTranslations("student");
  let user;
  try { ({ user } = await requireStudentGamificationAccess()); } catch (error) { if (error instanceof Error && error.message === "Unauthorized") redirect("/sign-in?next=%2Fleaderboard"); return <ApplicationPage><PageHeader title={locale === "en" ? "Leaderboard" : "Papan peringkat"} icon={Trophy} /><AccessErrorState title={t(error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable")} /></ApplicationPage>; }
  return <StudentLeaderboardView title={locale === "en" ? "Leaderboard" : "Papan peringkat"} courseRankings={locale === "en" ? "Course rankings" : "Peringkat kelas"} courseRankingsHref="/leaderboard/academic"><LeaderboardList userId={user.id} query={query} locale={locale} /></StudentLeaderboardView>;
}
