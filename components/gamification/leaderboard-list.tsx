import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { LeaderboardResults } from "@/components/gamification/leaderboard-results";
import { getGamificationLeaderboard } from "@/lib/gamification/leaderboard";
import { getTranslations } from "@/lib/i18n/server";
import type { LeaderboardPeriod, LeaderboardScope } from "@/lib/gamification/social-contracts";

export async function LeaderboardList({ userId, query, locale, embedded = false }: { userId: string; query: { period?: string; scope?: string; cursor?: string }; locale: string; embedded?: boolean }) {
  const period: LeaderboardPeriod = query.period === "week" || query.period === "month" ? query.period : "all";
  const scope: LeaderboardScope = query.scope === "following" ? "following" : "global";
  const t = await getTranslations("student");
  const resetHref = embedded ? "/achievements?tab=leaderboard" : "/leaderboard";
  const invalid = (query.period !== undefined && !["week", "month", "all"].includes(query.period)) || (query.scope !== undefined && !["global", "following"].includes(query.scope));
  const errorState = (message: string) => <AdminEmptyState icon={TriangleAlert} title={message} action={<Link className="text-body-sm text-primary underline" href={resetHref}>{t("achievementPage.reset")}</Link>} />;
  if (invalid) return errorState(t("achievementPage.invalidFilter"));
  let page;
  try { page = await getGamificationLeaderboard(userId, { period, scope, cursor: query.cursor }); }
  catch (error) { return errorState(t(error instanceof Error && error.message === "Invalid cursor" ? "achievementPage.invalidFilter" : error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable")); }
  return <LeaderboardResults page={page} period={period} scope={scope} locale={locale} basePath={embedded ? "/achievements" : "/leaderboard"} embedded={embedded} />;
}
