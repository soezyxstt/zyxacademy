import type { Metadata } from "next";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { createMetadata } from "@/lib/site";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { profileBadgeFamilies } from "@/components/gamification/achievement-board";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { StudentProfileView } from "@/components/student-profile-view";
import { StudentProfileContainer } from "@/features/student-profile/ui/student-profile-container";
import { ProfileFollowList } from "@/components/gamification/profile-follow-list";
import { getStudentSocialSettings } from "@/lib/gamification/social";
import { getAchievementBadges, getGamificationRewards, getGamificationSummary } from "@/lib/gamification/queries";
import { getPrivateProfileAggregates } from "@/lib/gamification/profile-aggregate";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";
import { cosmeticNameKeys } from "@/lib/gamification/labels";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslations("student"); return createMetadata({ title: t("profile.metadataTitle"), description: t("profile.metadataDescription"), path: "/profile" }); }

export default async function ProfilePage() {
 const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) redirect("/sign-in?next=/profile");
 const user = session.user; const [t, locale] = await Promise.all([getTranslations("student"), getAppLocale()]);
 const [row] = await db.select({ name: userTable.name, email: userTable.email, image: userTable.image, faculty: userTable.faculty, major: userTable.major, entryYear: userTable.entryYear }).from(userTable).where(eq(userTable.id, user.id)).limit(1);
 const userRole = (user as { role?: string | null }).role ?? null;
 const userRoles = (user as { roles?: string[] }).roles ?? [];
 const academicInfo = [row?.faculty, row?.major, row?.entryYear].filter(Boolean).join(" · ");
 const access = await getStudentGamificationAccess();
 if (!access) {
  const displayName = row?.name || user.name;
  return (
   <StudentProfileContainer
    mobileProps={{
     locale,
     pageTitle: t("profile.pageTitle"),
     editLabel: t("profile.editProfile"),
     editHref: "/settings?tab=profile",
     name: displayName,
     image: row?.image,
     academicInfo,
     role: userRole,
     roles: userRoles,
    }}
    desktopView={
     <ApplicationPage><PageHeader title={t("profile.pageTitle")} icon={UserRound} />
      <ProfileHero name={displayName} image={row?.image}
       academicInfo={academicInfo}
       actions={<Button asChild variant="outline"><Link href="/settings?tab=profile">{t("profile.editProfile")}</Link></Button>} />
     </ApplicationPage>
    }
   />
  );
 }
 const [settings, badges, rewards, summary, enrollments] = await Promise.all([getStudentSocialSettings(user.id), getAchievementBadges(user.id), getGamificationRewards(user.id), getGamificationSummary(user.id), listStudentEnrollments(user.id)]);
 const stats = await getPrivateProfileAggregates(user.id, enrollments.map(course => course.id));

 const frame = rewards.find(x => x.slot === "frame" && x.equipped)?.id; const theme = rewards.find(x => x.slot === "theme" && x.equipped)?.id; const zyraAvatar = rewards.find(x => x.slot === "zyra_avatar" && x.equipped && x.owned)?.id; const titleItem = rewards.find(x => x.slot === "title" && x.equipped); const title = titleItem && (cosmeticNameKeys[titleItem.id] ? t(`gamificationUi.${cosmeticNameKeys[titleItem.id]}`) : titleItem.name);
 const suitId = rewards.find(item => item.slot === "pet_suit" && item.owned && item.equipped)?.id;
 const actionId = rewards.find(item => item.slot === "pet_action" && item.owned && item.equipped)?.id;
 const displayName = settings.displayName || row?.name || user.name;
 const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
 return (
  <StudentProfileContainer
   mobileProps={{
    locale,
    pageTitle: t("profile.pageTitle"),
    editLabel: t("profile.editProfile"),
    editHref: "/settings?tab=profile",
    name: displayName,
    image: row?.image,
    frameId: frame,
    themeId: theme,
    title,
    zyraAvatarId: zyraAvatar,
    suitId,
    actionId,
    academicInfo,
    rank: summary.rankKey,
    baseXpMicro: summary.baseXpMicro,
    bonusXpMicro: summary.bonusXpMicro,
    lpBalance: summary.lpBalance,
    role: userRole,
    roles: userRoles,
   }}
   desktopView={
    <StudentProfileView locale={locale} name={displayName} image={row?.image} frameId={frame} themeId={theme} title={title} zyraAvatarId={zyraAvatar} suitId={suitId} actionId={actionId} academicInfo={academicInfo} rank={summary.rankKey} baseXpMicro={summary.baseXpMicro} bonusXpMicro={summary.bonusXpMicro} lpBalance={summary.lpBalance} stats={stats} enrollments={enrollments} badges={badges} featuredBadgeIds={settings.featuredBadgeIds} followSection={<ProfileFollowList />}
     labels={{ pageTitle: t("profile.pageTitle"), edit: t("profile.editProfile"), active: t("profile.activeClassesStat"), completed: t("profile.completedMaterialsStat"), exams: t("profile.completedExamsStat"), average: t("profile.averageScoreStat"), badgeBoard: t("profileCustomization.badgeBoard"), familyLabels, locked: t("profileCustomization.locked"), tiers: [1, 2, 3, 4, 5].map(tier => t("achievementPage.tier", { tier })), achievements: t("profileCustomization.achievements"), enrolled: t("profile.enrolledClasses"), noCourses: locale === "en" ? "No enrolled classes" : "Belum ada kelas yang diikuti", groups: t("profile.groupsTitle"), tutorials: t("profile.upcomingTutorials"), reflections: t("profile.reflections") }}
     links={{ edit: "/settings?tab=profile", achievements: "/achievements?tab=badges", courses: "/courses", course: "/courses", groups: "/dashboard/groups", schedule: "/dashboard/schedule", reflections: "/profile/reflections" }} />
   }
  />
 );
}
