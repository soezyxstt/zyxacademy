"use client";
import { FeedbackForm } from "@/app/(student)/feedback/feedback-form";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ProfileEditForm } from "@/app/(student)/profile/edit/profile-edit-form";
import { StudentReflectionsView } from "@/components/student-reflections-view";
import { validateAcademicProfile, type AcademicProfile } from "@/lib/student/academic-profile";
import { Bell, MessageSquareHeart, UserCheck, Code2, Compass, Target, Trophy, Users, Video } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { StudentCourseLeaderboardContent } from "@/components/course/student-course-leaderboard-content";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tab-styles";
import { cn } from "@/lib/utils";
import LiveStudentPage from "@/app/(student)/courses/[id]/live/page";
import type { DemoSummary } from "./demo-shell";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { StudentProfileView } from "@/components/student-profile-view";
import { StudentGroupsCompactClient } from "@/components/dashboard/student-groups-compact-client";
import { SettingsClient } from "@/app/(student)/settings/settings-client";
import { NotificationPreferencesForm } from "@/app/(student)/settings/notifications/notification-preferences-form";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "@/lib/email-preferences/contracts";
import { useStudentExperience } from "@/components/student-experience-provider";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudyPathTimeline, type StudyPathStep } from "@/components/course/study-path-timeline";
import { ConceptMap } from "@/components/course/concept-map";
import { ConceptGraphView } from "@/components/course/concept-graph-view";
import { useTranslations } from "@/lib/i18n/client";
import { demoProgress } from "@/lib/demo/progress-overlay";
import type { DemoMastery } from "@/lib/demo/mastery";

const Playground = dynamic(() => import("@/components/coding/playground").then(module => module.Playground));
const StudentScheduleClient = dynamic(() => import("@/app/(student)/dashboard/schedule/schedule-client").then(module => module.StudentScheduleClient));

export function DemoStudentPage({ view, experience: { content, snapshot }, mastery }: { view: string; experience: DemoSummary; mastery?: DemoMastery }) {
 const experience = useStudentExperience();
 const searchParams = useSearchParams();
 const [profile, setProfile] = useState<AcademicProfile | null>(null);
 const profileKey = `zyx-demo-profile:${experience.baseline.map(row => row.revision).join(":")}`;
 useEffect(() => {
   try {
     const raw: unknown = JSON.parse(sessionStorage.getItem(profileKey) ?? "null");
     if (!raw || typeof raw !== "object") return;
     const value = raw as Record<string, unknown>;
     if (typeof value.faculty !== "string" || typeof value.major !== "string" || typeof value.entryYear !== "number") return;
     const validated = validateAcademicProfile({ faculty: value.faculty, major: value.major, entryYear: value.entryYear });
     if (validated.profile) setProfile(validated.profile);
   } catch { /* Browser profile state is optional. */ }
 }, [profileKey]);
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
 if (view === "profile-edit") return <ApplicationPage><PageHeader title={<TranslatedText namespace="student" messageKey="profile.editTitle" />} icon={UserCheck} backHref={href("/profile")} backLabel={<TranslatedText namespace="student" messageKey="profile.pageTitle" />} /><Reveal className="mt-6"><ProfileEditForm key={JSON.stringify(profile)} user={{ id: "fictional-demo-student", ...account, ...(profile ?? { faculty: "STEI", major: "Teknik Informatika", entryYear: 2026 }) }} /></Reveal></ApplicationPage>;
 if (view === "reflections") return <StudentReflectionsView href={href} reflections={[]} />;
 const leaderboardByCourse = Object.fromEntries((experience.courses ?? []).map(course => [course.id, [{ rank: 1, name: account.name, avgScore: 84, attempts: 3 }]]));
 if (view === "leaderboard") return <StudentLeaderboardView href={href} allCourses={experience.courses ?? []} leaderboardByCourse={leaderboardByCourse} />;
 if (view === "course-leaderboard") {
   const activeType = searchParams.get("type") === "simulation" ? "simulation" : "quiz";
   const rankedRows = [{ rank: 1, studentId: "fictional-demo-student", userId: "fictional-demo-student", displayName: account.name, studentName: account.name, attemptCount: 3, attempts: 3, avgScore: 84, score: 84, avgDuration: 240, correctHardCount: 2, attemptedMediumCount: 3 }];
   return <CoursePageShell title={t("leaderboard.title", { course: content.course.title })} icon={Trophy}><Reveal>
     <nav aria-labelledby="leaderboard-type-label" className="mb-4"><span id="leaderboard-type-label" className="sr-only">{t("leaderboard.typeLabel")}</span><div className={tabListClassName}>
       <Link href={href(`/courses/${courseId}/leaderboard?type=quiz`)} aria-current={activeType === "quiz" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "quiz" && tabTriggerActiveClassName)}>{t("leaderboard.quiz")}</Link>
       <Link href={href(`/courses/${courseId}/leaderboard?type=simulation`)} aria-current={activeType === "simulation" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "simulation" && tabTriggerActiveClassName)}>{t("leaderboard.tryout")}</Link>
     </div></nav><StudentCourseLeaderboardContent rankedRows={rankedRows} userId="fictional-demo-student" activeType={activeType} />
   </Reveal></CoursePageShell>;
 }
 if (view === "live") return <LiveStudentPage />;
 if (view === "playground") return <CoursePageShell title="Playground Python" icon={Code2}><div data-plain-canvas><Playground courseId={courseId} learnerId="fictional-demo-student" /></div></CoursePageShell>;
 if (view === "feedback") return <ApplicationPage><PageHeader title={<TranslatedText namespace="student" messageKey="feedback.title" />} icon={MessageSquareHeart} /><Reveal className="mt-4"><FeedbackForm initialEmail={account.email} /></Reveal></ApplicationPage>;
 if (view === "settings") return <SettingsClient userName={account.name} userEmail={account.email} />;
 if (view === "notifications") return <ApplicationPage>
   <PageHeader title={<TranslatedText namespace="student" messageKey="notificationPreferences.title" />} icon={Bell} backHref={href("/settings")} backLabel={<TranslatedText namespace="student" messageKey="settings.title" />} />
   <Reveal className="mt-6"><NotificationPreferencesForm accountEmail={account.email} initialPreferences={DEFAULT_EMAIL_NOTIFICATION_PREFERENCES} /></Reveal>
 </ApplicationPage>;
 if (view === "groups") return <ApplicationPage><PageHeader icon={Users} title={<TranslatedText namespace="student" messageKey="navigation.groups" />} /><StudentGroupsCompactClient initialGroups={[]} /></ApplicationPage>;
 if (view === "schedule") return <StudentScheduleClient />;
 if (view === "video") return <CoursePageShell title={t("videoPage.title", { course: content.course.title })} icon={Video} backHref={href(`/courses/${courseId}`)} backLabel={t("videoPage.backToCourse")}>
   <Reveal><CourseVideosClient courseId={courseId} courseTitle={content.course.title} initialPlaylists={[]} chapters={[]} canManage={false} isEnrolled /></Reveal>
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
   <Reveal><div className="mb-6 space-y-3"><h2 className="font-heading text-body-base font-bold text-foreground">{t("mastery.conceptGraph")}</h2><ConceptGraphView courseId={courseId} nodes={mastery?.graphNodes ?? snapshot.weakConcepts.map(concept => ({ conceptName: concept.title, mastery: concept.masteryPercent }))} edges={mastery?.graphEdges ?? []} /></div></Reveal>
   <ConceptMap courseId={courseId} groups={mastery?.groups ?? [{ chapter: { id: "fictional-first-chapter", title: content.course.chapterTitle, orderIndex: 1 }, concepts: snapshot.weakConcepts.map(concept => ({ conceptName: concept.title, conceptSlug: null, masteryScore: concept.masteryPercent, confidence: 70, trend: "improving", blockedBy: [] })) }]} />
 </CoursePageShell>;
 return null;
}
