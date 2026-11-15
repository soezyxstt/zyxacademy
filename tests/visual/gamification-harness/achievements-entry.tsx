'use client';
// Fictional component fixture. Actions are mocked and no service or database is contacted.
import React from 'react';
import { Award } from 'lucide-react';
import { ApplicationPage } from '@/components/application-page';
import { PageHeader } from '@/components/page-header';
import { AdminEmptyState } from '@/components/admin/state-panels';
import { AchievementTabs } from '@/components/gamification/achievement-tabs';
import { AchievementBoard, profileBadgeFamilies } from '@/components/gamification/achievement-board';
import { RankPromotion } from '@/components/gamification/rank-promotion';
import { BadgeList } from '@/components/gamification/badge-list';
import { MissionList } from '@/components/gamification/mission-list';
import { RewardList } from '@/components/gamification/reward-list';
import { useTranslations } from '@/lib/i18n/client';
import type { BadgeFamily } from '@/lib/gamification/contracts';
import { summary, badges, missions, rewards, appearance } from './data';

export default function AchievementsFixture() {
  const t = useTranslations('student');
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('view') || 'overview';
  const labels = Object.fromEntries(['overview', 'badges', 'missions', 'rewards'].map(key => [key, t(`achievementPage.${key}`)]));
  const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
  return <div className="min-h-screen bg-background text-foreground"><ApplicationPage>
    <PageHeader title={t('gamificationUi.achievements')} icon={Award} />
    <AchievementTabs active={tab} labels={labels} />
    {tab === 'overview' && <div className="space-y-6">
      <RankPromotion summary={params.has('max') ? { ...summary, rankKey: 'presiden', baseXpMicro: 100_000_000_000, courseCreditsMicro: 10_000_000 } : summary} locale="id" labels={{ rank: rank => rank[0].toUpperCase() + rank.slice(1), nextRank: t('achievementPage.nextRank'), maximumRank: t('achievementPage.maximumRank'), xp: 'XP', courses: t('achievementPage.courses'), balance: t('achievementPage.balance'), requirement: t('achievementPage.promotionRequirement') }} />
      <AchievementBoard collectedOnly emptyTitle={t("profileCustomization.noBadges")} badges={params.has('empty') ? [] : badges} title={t('profileCustomization.badgeBoard')} familyLabels={familyLabels} lockedLabel={t('achievementPage.locked')} tierLabel={tier => ['I', 'II', 'III', 'IV', 'V'][tier - 1]} action={<a href="/achievements?tab=badges">{t('achievementPage.badges')}</a>} />
    </div>}
    {tab === 'badges' && <BadgeList badges={params.has('max') ? badges.map(badge => ({ ...badge, tier: 5, count: 2000, nextThreshold: null })) : badges} locale="id" labels={{ family: family => familyLabels[family], tier: tier => t('achievementPage.tier', { tier }), progress: t('achievementPage.progress'), complete: t('achievementPage.complete'), reward: lp => `${lp} LP`, locked: t('achievementPage.locked'), earned: t('achievementPage.earned') }} />}
    {tab === 'missions' && (params.has('empty') ? <AdminEmptyState title={t('achievementPage.noMissions')} /> : <MissionList missions={missions} locale="id" labels={{ mission: kind => t(`achievementPage.mission.${kind}`), category: kind => t(`achievementPage.missionCategory.${kind}`), reward: lp => `${lp} LP`, ends: t('achievementPage.ends'), complete: t('achievementPage.complete'), progress: t('achievementPage.progress') }} />)}
    {tab === 'rewards' && <RewardList rewards={params.has('empty') ? [] : rewards} balance={1240} appearance={appearance} />}
  </ApplicationPage></div>;
}
