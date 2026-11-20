"use client";
import { useEffect, useMemo, useState } from "react";
import { fictionalQuizHistory, localQuizHistory, type DemoQuizHistoryRow } from "@/lib/demo/assessment/history";
import { emptyOverlay } from "@/lib/demo/session-overlay";
import { StudentProfileView } from "@/components/student-profile-view";
import { ProfileFollowList } from "@/components/gamification/profile-follow-list";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { profileBadgeFamilies } from "@/lib/gamification/profile-badges";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import type { AcademicProfile } from "@/lib/student/academic-profile";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { demoBadges, demoFeaturedBadges, demoSummary } from "@/lib/demo/gamification";
import { useDemoSession } from "./demo-session";
import { useDemoGamification } from "./demo-gamification-provider";

export function DemoProfile({ profile }: { profile: AcademicProfile | null }) {
 const experience = useStudentExperience();
 const { state: gamification } = useDemoGamification();
 const { overlays, ready } = useDemoSession();
 const [attempts, setAttempts] = useState<DemoQuizHistoryRow[]>([]);
 const baselineAttempts = useMemo(() => experience.baseline.flatMap(fictionalQuizHistory), [experience.baseline]);
 useEffect(() => {
   if (!ready) return;
   setAttempts(experience.baseline.flatMap(row =>
     localQuizHistory(row, overlays[row.courseId] ?? emptyOverlay(), key => localStorage.getItem(key))));
 }, [experience.baseline, overlays, ready]);
 const results = [...baselineAttempts, ...attempts];
 const stats = {
   completedCount: experience.baseline.reduce((sum, row) => sum + demoProgress(row, overlays[row.courseId] ?? emptyOverlay()).completedMaterials, 0),
   submissionCount: attempts.length + experience.baseline.reduce((total, row) =>
     total + row.history.reduce((sum, day) => sum + day.quizzesCompleted, 0), 0),
   averageScore: results.length ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null,
 };
 const student = useTranslations("student");
 const { locale } = useAppLocale();
 const account = experience.account ?? { name: "Pelajar Demo", email: "pelajar@example.test" };
 const href = (path: string) => experience.href?.(path) ?? path;
 const titleKey = cosmeticNameKeys[gamification.equipped.title];
 return <StudentProfileView locale={locale} name={account.name} academicInfo={[profile?.faculty ?? "STEI", profile?.major ?? "Teknik Informatika", profile?.entryYear ?? 2026].filter(Boolean).join(" · ")} rank={demoSummary.rankKey} frameId={gamification.equipped.frame} themeId={gamification.equipped.theme} title={titleKey ? student(`gamificationUi.${titleKey}`) : undefined} zyraAvatarId={gamification.equipped.zyra_avatar} suitId={gamification.equipped.pet_suit} actionId={gamification.equipped.pet_action} baseXpMicro={demoSummary.baseXpMicro} bonusXpMicro={demoSummary.bonusXpMicro} lpBalance={gamification.balance} badges={demoBadges} featuredBadgeIds={demoFeaturedBadges} followSection={<ProfileFollowList />}
   stats={stats}
   enrollments={experience.baseline.map(row => ({ id: row.courseId, title: experience.courses?.find(course => course.id === row.courseId)?.title ?? row.courseId, href: href(`/courses/${row.courseId}`) }))}
   labels={{ pageTitle: student("profile.pageTitle"), edit: student("profile.editProfile"), active: student("profile.activeClassesStat"), completed: student("profile.completedMaterialsStat"), exams: student("profile.completedExamsStat"), average: student("profile.averageScoreStat"), badgeBoard: student("profileCustomization.badgeBoard"), familyLabels: Object.fromEntries(profileBadgeFamilies.map(family => [family, student(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>, locked: student("profileCustomization.locked"), tiers: [1, 2, 3, 4, 5].map(tier => student("achievementPage.tier", { tier })), achievements: student("profileCustomization.achievements"), enrolled: student("profile.enrolledClasses"), noCourses: locale === "en" ? "No enrolled classes" : "Belum ada kelas yang diikuti", groups: student("profile.groupsTitle"), tutorials: student("profile.upcomingTutorials"), reflections: student("profile.reflections") }}
   links={{ achievements: href("/achievements"), edit: href("/profile/edit"), courses: href("/courses"), course: href("/courses"), groups: href("/dashboard/groups"), schedule: href("/dashboard/schedule"), reflections: href("/profile/reflections") }} />;
}
