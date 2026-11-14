import Link from "next/link";
import type { Metadata } from "next";
import { createMetadata } from "@/lib/site";
import { BookOpen } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { AchievementBoard, profileBadgeFamilies } from "@/components/gamification/achievement-board";
import { AdminEmptyState } from "@/components/admin/state-panels";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { ProfileFollowList } from "@/components/gamification/profile-follow-list";
import { getStudentSocialSettings } from "@/lib/gamification/social";
import { getAchievementBadges, getGamificationRewards, getGamificationSummary } from "@/lib/gamification/queries";
import { getPrivateProfileAggregates } from "@/lib/gamification/profile-aggregate";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { MICRO } from "@/lib/gamification/catalog";

export async function generateMetadata(): Promise<Metadata> { const t = await getTranslations("student"); return createMetadata({ title: t("profile.metadataTitle"), description: t("profile.metadataDescription"), path: "/profile" }); }

export default async function ProfilePage() {
 const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) redirect("/sign-in?next=/profile");
 const user = session.user; const [t, locale] = await Promise.all([getTranslations("student"), getAppLocale()]);
 const [row] = await db.select({ name: userTable.name, email: userTable.email, image: userTable.image, faculty: userTable.faculty, major: userTable.major, entryYear: userTable.entryYear }).from(userTable).where(eq(userTable.id, user.id)).limit(1);
 const [settings, badges, rewards, summary, enrollments] = await Promise.all([getStudentSocialSettings(user.id), getAchievementBadges(user.id), getGamificationRewards(user.id), getGamificationSummary(user.id), listStudentEnrollments(user.id)]);
 const stats = await getPrivateProfileAggregates(user.id, enrollments.map(course => course.id));

 const frame = rewards.find(x => x.slot === "frame" && x.equipped)?.id; const theme = rewards.find(x => x.slot === "theme" && x.equipped)?.id; const titleItem = rewards.find(x => x.slot === "title" && x.equipped); const title = titleItem && (cosmeticNameKeys[titleItem.id] ? t(`gamificationUi.${cosmeticNameKeys[titleItem.id]}`) : titleItem.name);
 const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
 return <ApplicationPage><PageHeader title={t("profile.pageTitle")} icon={UserRound} /><div className="space-y-6">
 <ProfileHero name={settings.displayName || row?.name || user.name} image={row?.image} frameId={frame} themeId={theme} title={title} academicInfo={[row?.faculty, row?.major, row?.entryYear].filter(Boolean).join(" · ")} rank={summary.rankKey} actions={<Button asChild variant="outline"><Link href="/profile/edit">{t("profile.editProfile")}</Link></Button>} details={<><span>{new Intl.NumberFormat().format((summary.baseXpMicro + summary.bonusXpMicro) / MICRO)} XP · {new Intl.NumberFormat().format(summary.lpBalance)} LP</span><p>{t("profile.activeClassesStat")}: {enrollments.length} · {t("profile.completedMaterialsStat")}: {stats.completedCount} · {t("profile.completedExamsStat")}: {stats.submissionCount} · {t("profile.averageScoreStat")}: {stats.averageScore ?? "-"}</p></>} />
 <AchievementBoard badges={badges} featuredBadgeIds={settings.featuredBadgeIds} title={t("profileCustomization.badgeBoard")} familyLabels={familyLabels} lockedLabel={t("profileCustomization.locked")} tierLabel={tier => t("achievementPage.tier", { tier })} action={<Button variant="outline" size="sm" asChild><Link href="/achievements?tab=badges">{t("profileCustomization.achievements")}</Link></Button>} />
 <section className="space-y-2"><h2 className="font-heading text-body-base font-bold">{t("profile.enrolledClasses")}</h2><div className="divide-y rounded-xl border bg-card">{enrollments.length ? enrollments.map(course => <Link className="block p-3 text-body-sm underline" key={course.id} href={`/courses/${course.id}`}>{course.title}</Link>) : <AdminEmptyState icon={BookOpen} title={locale === "en" ? "No enrolled classes" : "Belum ada kelas yang diikuti"} action={<Button asChild variant="outline"><Link href="/courses">{t("profile.enrolledClasses")}</Link></Button>} />}</div></section>
 <ProfileFollowList /><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/dashboard/groups">{t("profile.groupsTitle")}</Link></Button><Button asChild variant="outline"><Link href="/dashboard/schedule">{t("profile.upcomingTutorials")}</Link></Button><Button asChild variant="outline"><Link href="/courses">{t("profile.enrolledClasses")}</Link></Button><Button asChild variant="outline"><Link href="/profile/reflections">{t("profile.reflections")}</Link></Button></div></div></ApplicationPage>;
}
