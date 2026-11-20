"use client";
import Link from "next/link";
import { Award } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AchievementTabs } from "@/components/gamification/achievement-tabs";
import { AchievementBoard, profileBadgeFamilies } from "@/components/gamification/achievement-board";
import { BadgeList } from "@/components/gamification/badge-list";
import { MissionList } from "@/components/gamification/mission-list";
import { RankPromotion } from "@/components/gamification/rank-promotion";
import { RewardList } from "@/components/gamification/reward-list";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { demoBadges, demoFeaturedBadges, demoMissions, demoRewards, demoSummary } from "@/lib/demo/gamification";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoGamification } from "./demo-gamification-provider";

export function DemoAchievements() {
  const params = useSearchParams();
  const { locale } = useAppLocale();
  const t = useTranslations("student");
  const { href: mapHref, account } = useStudentExperience();
  const href = (path: string) => mapHref?.(path) ?? path;
  const { state, changeReward } = useDemoGamification();
  const labels = Object.fromEntries(["overview", "badges", "missions", "rewards"].map(key => [key, t(`achievementPage.${key}`)]));
  const requested = params.get("tab");
  const tab = requested && Object.hasOwn(labels, requested) ? requested : "overview";
  const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
  const summary = { ...demoSummary, lpBalance: state.balance };
  return <ApplicationPage><PageHeader title={t("gamificationUi.achievements")} icon={Award} />
    <AchievementTabs active={tab} labels={labels} href={href} />
    {tab === "overview" && <div className="space-y-6">
      <RankPromotion summary={summary} locale={locale} labels={{ rank: rank => rank.charAt(0).toUpperCase() + rank.slice(1), nextRank: t("achievementPage.nextRank"), maximumRank: t("achievementPage.maximumRank"), xp: "XP", courses: t("achievementPage.courses"), balance: t("achievementPage.balance"), requirement: t("achievementPage.promotionRequirement") }} />
      <AchievementBoard collectedOnly emptyTitle={t("profileCustomization.noBadges")} badges={demoBadges} featuredBadgeIds={demoFeaturedBadges} title={t("profileCustomization.badgeBoard")} familyLabels={familyLabels} lockedLabel={t("achievementPage.locked")} tierLabel={tier => ["I", "II", "III", "IV", "V"][tier - 1]} action={<Link href={href("/achievements?tab=badges")} className="text-body-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("achievementPage.badges")}</Link>} />
    </div>}
    {tab === "badges" && <BadgeList badges={demoBadges} locale={locale} labels={{ family: family => familyLabels[family], tier: tier => t("achievementPage.tier", { tier }), progress: t("achievementPage.progress"), complete: t("achievementPage.complete"), reward: lp => `${lp} LP`, locked: t("achievementPage.locked"), earned: t("achievementPage.earned") }} />}
    {tab === "missions" && <MissionList missions={demoMissions} locale={locale} labels={{ mission: kind => t(`achievementPage.mission.${kind}`), category: kind => t(`achievementPage.missionCategory.${kind}`), reward: lp => `${lp} LP`, ends: t("achievementPage.ends"), complete: t("achievementPage.complete"), progress: t("achievementPage.progress") }} />}
    {tab === "rewards" && <RewardList rewards={demoRewards(state)} balance={state.balance} appearance={{ name: account?.name ?? "Pelajar Demo", frameId: state.equipped.frame, themeId: state.equipped.theme }} onChangeReward={changeReward} missionsHref={href("/achievements?tab=missions")} />}
  </ApplicationPage>;
}
