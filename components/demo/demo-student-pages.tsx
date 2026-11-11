"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { validateAcademicProfile, type AcademicProfile } from "@/lib/student/academic-profile";
import { Bell, MessageSquareHeart, UserCheck, Code2, Compass, Target, Trophy, Users, Video } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tab-styles";
import { cn } from "@/lib/utils";
import type { DemoSummary } from "./demo-shell";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TranslatedText } from "@/components/i18n/translated-text";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "@/lib/email-preferences/contracts";
import { useStudentExperience } from "@/components/student-experience-provider";
import { CoursePageShell } from "@/components/course/course-page-shell";
import type { StudyPathStep } from "@/components/course/study-path-timeline";
import { useTranslations } from "@/lib/i18n/client";
import { demoProgress } from "@/lib/demo/progress-overlay";
import type { DemoMastery } from "@/lib/demo/mastery";

function DemoFeatureLoading() {
 return <div role="status" aria-busy="true" aria-label="Loading" className="space-y-4 py-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>;
}
const loading = { loading: DemoFeatureLoading };
const FeedbackForm = dynamic(() => import("@/app/(student)/feedback/feedback-form").then(module => module.FeedbackForm), loading);
const CourseVideosClient = dynamic(() => import("@/components/course/video/course-videos-client").then(module => module.CourseVideosClient), loading);
const ProfileEditForm = dynamic(() => import("@/app/(student)/profile/edit/profile-edit-form").then(module => module.ProfileEditForm), loading);
const StudentReflectionsView = dynamic(() => import("@/components/student-reflections-view").then(module => module.StudentReflectionsView), loading);
const StudentLeaderboardView = dynamic(() => import("@/components/student-leaderboard-view").then(module => module.StudentLeaderboardView), loading);
const StudentCourseLeaderboardContent = dynamic(() => import("@/components/course/student-course-leaderboard-content").then(module => module.StudentCourseLeaderboardContent), loading);
const LiveStudentPage = dynamic(() => import("@/app/(student)/courses/[id]/live/page"), loading);
const StudentProfileView = dynamic(() => import("@/components/student-profile-view").then(module => module.StudentProfileView), loading);
const StudentGroupsCompactClient = dynamic(() => import("@/components/dashboard/student-groups-compact-client").then(module => module.StudentGroupsCompactClient), loading);
const SettingsClient = dynamic(() => import("@/app/(student)/settings/settings-client").then(module => module.SettingsClient), loading);
const NotificationPreferencesForm = dynamic(() => import("@/app/(student)/settings/notifications/notification-preferences-form").then(module => module.NotificationPreferencesForm), loading);
const StudyPathTimeline = dynamic(() => import("@/components/course/study-path-timeline").then(module => module.StudyPathTimeline), loading);
const ConceptMap = dynamic(() => import("@/components/course/concept-map").then(module => module.ConceptMap), loading);
const ConceptGraphView = dynamic(() => import("@/components/course/concept-graph-view").then(module => module.ConceptGraphView), loading);
const Playground = dynamic(() => import("@/components/coding/playground").then(module => module.Playground), loading);
const StudentScheduleClient = dynamic(() => import("@/app/(student)/dashboard/schedule/schedule-client").then(module => module.StudentScheduleClient), loading);

export function DemoStudentPage({ view, experience: { content, snapshot }, mastery }: { view: string; experience: DemoSummary; mastery?: DemoMastery }) {
 const experience = useStudentExperience();
 const searchParams = useSearchParams();
 const [profile, setProfile] = useState<AcademicProfile | null>(null);
 const profileKey = `zyx-demo-profile:${experience.baseline.map(row => row.revision).join(":")}`;
 useEffect(() => {
   if (view !== "profile" && view !== "profile-edit") return;
   let loaded: AcademicProfile | null = null;
   try {
     const raw: unknown = JSON.parse(sessionStorage.getItem(profileKey) ?? "null");
     if (raw && typeof raw === "object") {
       const value = raw as Record<string, unknown>;
       if (typeof value.faculty === "string" && typeof value.major === "string" && typeof value.entryYear === "number") {
         loaded = validateAcademicProfile({ faculty: value.faculty, major: value.major, entryYear: value.entryYear }).profile ?? null;
       }
     }
   } catch { /* Browser profile state is optional. */ }
   setProfile(loaded);
 }, [profileKey, view]);
 const t = useTranslations("learning");
 const account = experience.account ?? { name: "Pelajar Demo", email: "pelajar@example.test" };
 const href = (path: string) => experience.href?.(path) ?? path;
 const courseId = snapshot.courseId;
 if (view === "profile") return <StudentProfileView href={href}
   user={{ ...account, role: "student", createdAt: new Date("2026-02-12T00:00:00Z"), lastActivityAt: new Date(`${snapshot.asOf}T12:00:00Z`) }}
   activeEnrollments={experience.baseline.map(row => ({ id: row.courseId, title: experience.courses?.find(course => course.id === row.courseId)?.title ?? row.courseId, category: experience.courses?.find(course => course.id === row.courseId)?.category, enrolledAt: new Date("2026-02-12T00:00:00Z") }))}
   completedCount={experience.baseline.reduce((total, row) => total + (row.courseId === courseId && experience.overlay ? demoProgress(row, experience.overlay).completedMaterials : row.course.completedMaterials), 0)}
   submissionCount={experience.baseline.reduce((total, row) => total + row.history.reduce((sum, day) => sum + day.quizzesCompleted, 0), 0)}
   averageScore={84} userGroups={[]} studentBookings={[]} dbUser={profile ?? { faculty: "STEI", major: "Teknik Informatika", entryYear: 2026 }} />;
 if (view === "profile-edit") return <ApplicationPage><PageHeader title={<TranslatedText namespace="student" messageKey="profile.editTitle" />} icon={UserCheck} backHref={href("/profile")} backLabel={<TranslatedText namespace="student" messageKey="profile.pageTitle" />} /><div className="mt-6"><ProfileEditForm key={JSON.stringify(profile)} user={{ id: "fictional-demo-student", ...account, ...(profile ?? { faculty: "STEI", major: "Teknik Informatika", entryYear: 2026 }) }} /></div></ApplicationPage>;
 if (view === "reflections") return <StudentReflectionsView href={href} reflections={[]} />;
 const leaderboardByCourse = Object.fromEntries((experience.courses ?? []).map(course => [course.id, [{ rank: 1, name: account.name, avgScore: 84, attempts: 3 }]]));
 if (view === "leaderboard") return <StudentLeaderboardView href={href} allCourses={experience.courses ?? []} leaderboardByCourse={leaderboardByCourse} />;
 if (view === "course-leaderboard") {
   const activeType = searchParams.get("type") === "simulation" ? "simulation" : "quiz";
   const rankedRows = [{ rank: 1, studentId: "fictional-demo-student", userId: "fictional-demo-student", displayName: account.name, studentName: account.name, attemptCount: 3, attempts: 3, avgScore: 84, score: 84, avgDuration: 240, correctHardCount: 2, attemptedMediumCount: 3 }];
   return <CoursePageShell title={t("leaderboard.title", { course: content.course.title })} icon={Trophy}>
     <nav aria-labelledby="leaderboard-type-label" className="mb-4"><span id="leaderboard-type-label" className="sr-only">{t("leaderboard.typeLabel")}</span><div className={tabListClassName}>
       <Link href={href(`/courses/${courseId}/leaderboard?type=quiz`)} aria-current={activeType === "quiz" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "quiz" && tabTriggerActiveClassName)}>{t("leaderboard.quiz")}</Link>
       <Link href={href(`/courses/${courseId}/leaderboard?type=simulation`)} aria-current={activeType === "simulation" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "simulation" && tabTriggerActiveClassName)}>{t("leaderboard.tryout")}</Link>
     </div></nav><StudentCourseLeaderboardContent rankedRows={rankedRows} userId="fictional-demo-student" activeType={activeType} />
   </CoursePageShell>;
 }
 if (view === "live") return <LiveStudentPage />;
 if (view === "playground") return <CoursePageShell title="Playground Python" icon={Code2}><div data-plain-canvas><Playground courseId={courseId} learnerId="fictional-demo-student" /></div></CoursePageShell>;
 if (view === "feedback") return <ApplicationPage><PageHeader title={<TranslatedText namespace="student" messageKey="feedback.title" />} icon={MessageSquareHeart} /><div className="mt-4"><FeedbackForm initialEmail={account.email} /></div></ApplicationPage>;
 if (view === "settings") return <SettingsClient userName={account.name} userEmail={account.email} />;
 if (view === "notifications") return <ApplicationPage>
   <PageHeader title={<TranslatedText namespace="student" messageKey="notificationPreferences.title" />} icon={Bell} backHref={href("/settings")} backLabel={<TranslatedText namespace="student" messageKey="settings.title" />} />
   <div className="mt-6"><NotificationPreferencesForm accountEmail={account.email} initialPreferences={DEFAULT_EMAIL_NOTIFICATION_PREFERENCES} /></div>
 </ApplicationPage>;
 if (view === "groups") return <ApplicationPage><PageHeader icon={Users} title={<TranslatedText namespace="student" messageKey="navigation.groups" />} /><StudentGroupsCompactClient initialGroups={[]} /></ApplicationPage>;
 if (view === "schedule") return <StudentScheduleClient />;
 if (view === "video") return <CoursePageShell title={t("videoPage.title", { course: content.course.title })} icon={Video} backHref={href(`/courses/${courseId}`)} backLabel={t("videoPage.backToCourse")}>
   <CourseVideosClient courseId={courseId} courseTitle={content.course.title} initialPlaylists={[]} chapters={[]} canManage={false} isEnrolled />
 </CoursePageShell>;
 if (view === "path") {
   const steps: StudyPathStep[] = snapshot.weakConcepts.map((concept, index) => ({
     stepId: `fictional-step-${index}`, ideaId: null, chapterId: "fictional-first-chapter", chapterTitle: content.course.chapterTitle, chapterOrder: 1,
     conceptName: concept.title, status: index === 0 ? "in_progress" : "available", actions: { moduleHref: href(`/courses/${courseId}/material`) },
     estimatedMinutes: 12, prerequisites: [], masteryScore: concept.masteryPercent, priorityReason: t("mastery.title", { course: content.course.title }),
   }));
   return <CoursePageShell title={t("path.title", { course: content.course.title })} icon={Compass}><StudyPathTimeline courseId={courseId} initialSteps={steps} /></CoursePageShell>;
 }
 if (view === "mastery") return <CoursePageShell title={t("mastery.title", { course: content.course.title })} icon={Target}>
   <div className="mb-6 space-y-3"><h2 className="font-heading text-body-base font-bold text-foreground">{t("mastery.conceptGraph")}</h2><ConceptGraphView courseId={courseId} nodes={mastery?.graphNodes ?? snapshot.weakConcepts.map(concept => ({ conceptName: concept.title, mastery: concept.masteryPercent }))} edges={mastery?.graphEdges ?? []} /></div>
   <ConceptMap courseId={courseId} groups={mastery?.groups ?? [{ chapter: { id: "fictional-first-chapter", title: content.course.chapterTitle, orderIndex: 1 }, concepts: snapshot.weakConcepts.map(concept => ({ conceptName: concept.title, conceptSlug: null, masteryScore: concept.masteryPercent, confidence: 70, trend: "improving", blockedBy: [] })) }]} />
 </CoursePageShell>;
 return null;
}
