import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { AchievementBoard, profileBadgeFamilies } from "@/components/gamification/achievement-board";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { SocialControls } from "@/components/gamification/social-controls";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getPublicStudentProfile } from "@/lib/gamification/social";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";
import { AdminEmptyState as AccessErrorState } from "@/components/admin/state-panels";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function PublicProfilePage({ params }: { params: Promise<{ publicId: string }> }) {
  const [{ publicId }, locale] = await Promise.all([params, getAppLocale()]);
  const english = locale === "en";
  const t = await getTranslations("student");
  let user;
  try { ({ user } = await requireStudentGamificationAccess()); } catch (error) { if (error instanceof Error && error.message === "Unauthorized") redirect(`/sign-in?next=${encodeURIComponent(`/students/${publicId}`)}`); return <ApplicationPage><PageHeader title={english ? "Student profile" : "Profil siswa"} icon={UserRound} /><AccessErrorState title={t(error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable")} /></ApplicationPage>; }
  let profile;
  try { profile = await getPublicStudentProfile(user.id, publicId); } catch { return <ApplicationPage><PageHeader title={english ? "Student profile" : "Profil siswa"} icon={UserRound} /><AccessErrorState title={t("achievementPage.unavailable")} /></ApplicationPage>; }
  const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
  const ranks: RankKey[] = ["rakyat", "kades", "camat", "bupati", "gubernur", "presiden"];
  const rank = ranks.find(item => item === profile?.rankKey) ?? "rakyat";
  const titleKey = profile?.equippedTitleId && cosmeticNameKeys[profile.equippedTitleId];
  return <ApplicationPage><PageHeader title={english ? "Student profile" : "Profil siswa"} icon={UserRound} />
    {profile ? <div className="space-y-6"><ProfileHero name={profile.displayName} image={profile.avatarUrl} frameId={profile.equippedFrameId} themeId={profile.equippedThemeId} zyraAvatarId={profile.equippedZyraAvatarId} title={titleKey ? t(`gamificationUi.${titleKey}`) : null} academicInfo={[profile.major, profile.faculty].filter(Boolean).join(" · ")} rank={rank} details={`${profile.followerCount} ${english ? "followers" : "pengikut"} · ${profile.followingCount} ${english ? "following" : "diikuti"}`} actions={<SocialControls publicId={profile.publicId} following={profile.isFollowing} canFollow={profile.canFollow} english={english} />} />
      <AchievementBoard badges={profile.earnedBadges} featuredBadgeIds={profile.featuredBadgeIds} title={t("profileCustomization.badgeBoard")} familyLabels={familyLabels} lockedLabel={t("profileCustomization.locked")} tierLabel={tier => t("achievementPage.tier", { tier })} />
    </div> : <AdminEmptyState icon={UserRound} title={english ? "Profile unavailable" : "Profil tidak tersedia"} />}
  </ApplicationPage>;
}
