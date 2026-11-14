import { LeaderboardList } from "@/components/gamification/leaderboard-list";
import { Award, Inbox } from "lucide-react";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AchievementTabs } from "@/components/gamification/achievement-tabs";
import { BadgeList } from "@/components/gamification/badge-list";
import { MissionList } from "@/components/gamification/mission-list";
import { RankPromotion } from "@/components/gamification/rank-promotion";
import { RewardList } from "@/components/gamification/reward-list";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getAchievementBadges, getGamificationMissions, getGamificationRewards, getGamificationSummary } from "@/lib/gamification/queries";
import { getStudentSocialSettings } from "@/lib/gamification/social";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";
import type { RankKey } from "@/lib/gamification/contracts";

const summaryForRequest = cache(getGamificationSummary);
const rewardsForRequest = cache(getGamificationRewards);
const badgesForRequest = cache(getAchievementBadges);
const settingsForRequest = cache(getStudentSocialSettings);
const rankName = (rank: RankKey) => rank.charAt(0).toUpperCase() + rank.slice(1);

export default async function AchievementsPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string; scope?: string; cursor?: string }> }) {
  const [params, locale] = await Promise.all([searchParams, getAppLocale()]);
  const t = await getTranslations("student");
  const labels = Object.fromEntries(["overview", "badges", "missions", "leaderboard", "rewards"].map(key => [key, t(`achievementPage.${key}`)]));
  const tab = params.tab && Object.hasOwn(labels, params.tab) ? params.tab : "overview";
  let user;
  try { ({ user } = await requireStudentGamificationAccess()); } catch (error) { if (error instanceof Error && error.message === "Unauthorized") redirect("/sign-in?next=%2Fachievements"); return <ApplicationPage><PageHeader title={t("gamificationUi.achievements")} icon={Award} /><AdminEmptyState title={error instanceof Error && error.message === "Forbidden" ? t("achievementPage.forbidden") : t("achievementPage.unavailable")} /></ApplicationPage>; }
  try {
  const [summary, badges, missions, rewards, settings] = await Promise.all([
    tab === "overview" || tab === "rewards" ? summaryForRequest(user.id) : null,
    tab === "badges" || tab === "rewards" ? badgesForRequest(user.id) : [],
    tab === "missions" ? getGamificationMissions(user.id) : [],
    tab === "rewards" ? rewardsForRequest(user.id) : [],
    tab === "rewards" ? settingsForRequest(user.id) : null,
  ]);
  const selectedBadge = badges.find(b => b.family === settings?.avatarBadgeId && b.tier > 0);
  const appearance = settings ? {
    name: settings.displayName || user.name, image: user.image, mode: settings.avatarMode,
    badge: selectedBadge && settings.badgeTier && settings.badgeTier <= selectedBadge.tier ? { family: selectedBadge.family, tier: settings.badgeTier } : null,
    frameId: rewards.find(item => item.slot === "frame" && item.equipped && item.owned)?.id,
    themeId: rewards.find(item => item.slot === "theme" && item.equipped && item.owned)?.id,
  } : null;
  return <ApplicationPage><PageHeader title={t("gamificationUi.achievements")} icon={Award} />
    <AchievementTabs active={tab} labels={labels} />
    {summary && tab === "overview" && <RankPromotion summary={summary} locale={locale} labels={{ rank: rankName, nextRank: t("achievementPage.nextRank"), maximumRank: t("achievementPage.maximumRank"), xp: "XP", courses: t("achievementPage.courses") }} />}
    {tab === "badges" && <BadgeList badges={badges} locale={locale} labels={{ family: family => t(`profileCustomization.families.${family}`), tier: tier => t("achievementPage.tier", { tier }), progress: t("achievementPage.progress"), complete: t("achievementPage.complete"), reward: lp => `${lp} LP`, locked: t("achievementPage.locked"), earned: t("achievementPage.earned") }} />}
    {tab === "missions" && (missions.length ? <MissionList missions={missions} locale={locale} labels={{ mission: kind => t(`achievementPage.mission.${["material", "question", "recall", "qualified_days"].includes(kind) ? kind : "unknown"}`), reward: lp => `${lp} LP`, ends: t("achievementPage.ends"), complete: t("achievementPage.complete") }} /> : <AdminEmptyState icon={Inbox} title={t("achievementPage.noMissions")} />)}
    {tab === "rewards" && summary && appearance && (rewards.length ? <RewardList rewards={rewards} balance={summary.lpBalance} appearance={appearance} /> : <AdminEmptyState icon={Inbox} title={t("achievementPage.noRewards")} />)}
    {tab === "leaderboard" && <LeaderboardList userId={user.id} query={params} locale={locale} embedded />}
  </ApplicationPage>;
  } catch { return <ApplicationPage><PageHeader title={t("gamificationUi.achievements")} icon={Award} /><AdminEmptyState title={t("achievementPage.unavailable")} action={<a href="/achievements" className="text-body-sm text-primary underline">{t("achievementPage.retry")}</a>} /></ApplicationPage>; }
}
