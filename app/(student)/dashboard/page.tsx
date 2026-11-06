import { Suspense } from "react";
import type { Metadata } from "next";
import { getStudentEnrollments } from "@/app/(student)/dashboard/actions";
import { ApplicationPage } from "@/components/application-page";
import { InterventionBanner } from "@/components/dashboard/intervention-banner";
import { TranslatedText } from "@/components/i18n/translated-text";
import { StudentDashboardContent } from "@/components/dashboard/student-dashboard-content";
import { getAuthSession, type AuthUser } from "@/lib/auth-session";
import { getTranslations } from "@/lib/i18n/server";
import { createMetadata } from "@/lib/site";
import { DashboardSectionErrorBoundary } from "./dashboard-section-error-boundary";
import {
  AvailableAssessmentsSection,
  DashboardOnboardingSection,
  PrimaryLearningSection,
  ProfilePromptSection,
  RecommendedCoursesSection,
  ReviewQueueSection,
  TodayPlanSection,
  WeakConceptsSection,
  WeeklyReflectionSection,
  type DashboardUserSeed,
} from "./dashboard-sections";
import {
  DashboardHeaderShell,
  DashboardOnboardingSkeleton,
  DashboardPrimaryLearningSkeleton,
  DashboardSectionSkeleton,
} from "./dashboard-skeletons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("dashboard.pageTitle"), description: t("dashboard.metadataDescription"), path: "/dashboard" });
}

function toDashboardUserSeed(user: AuthUser | null | undefined): DashboardUserSeed | undefined {
  if (!user) return undefined;
  const record = user as unknown as Record<string, unknown>;
  return {
    id: user.id,
    name: user.name,
    faculty: typeof record.faculty === "string" ? record.faculty : null,
    major: typeof record.major === "string" ? record.major : null,
    entryYear: typeof record.entryYear === "number" ? record.entryYear : null,
  };
}

/**
 * Server-rendered dashboard shell resolving only the minimal auth and enrollment
 * gate in the parent before streaming independent child learning boundaries.
 */
export default async function DashboardPage() {
  const [session, enrollments] = await Promise.all([
    getAuthSession(),
    getStudentEnrollments(),
  ]);

  const user = toDashboardUserSeed(session?.user);
  const userName = user?.name ?? "";
  const firstName = userName.split(" ")[0] ?? "";
  const isEnrolledInAny = enrollments.length > 0;
  const enrolledCourseIds = enrollments.map((e) => e.id);

  return (
    <ApplicationPage className="pb-16">
      <DashboardSectionErrorBoundary variant="silent">
        <Suspense fallback={null}>
          <ProfilePromptSection user={user} />
        </Suspense>
      </DashboardSectionErrorBoundary>

      {!isEnrolledInAny ? (
        <DashboardSectionErrorBoundary
          variant="primary"
          sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.coursesForYou" />}
        >
          <Suspense fallback={<DashboardOnboardingSkeleton />}>
            <DashboardOnboardingSection user={user} userName={userName} />
          </Suspense>
        </DashboardSectionErrorBoundary>
      ) : (
        <>
          {user?.id && (
            <DashboardSectionErrorBoundary variant="silent">
              <InterventionBanner />
            </DashboardSectionErrorBoundary>
          )}
          {user?.id && (
            <DashboardSectionErrorBoundary variant="silent">
              <Suspense fallback={null}>
                <WeeklyReflectionSection userId={user.id} />
              </Suspense>
            </DashboardSectionErrorBoundary>
          )}

          {user?.id ? (
            <DashboardSectionErrorBoundary
              variant="secondary"
              fallbackHeader={<DashboardHeaderShell firstName={firstName} />}
              sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.studyPlan" />}
            >
              <Suspense fallback={<DashboardHeaderShell firstName={firstName} />}>
                <TodayPlanSection userId={user.id} firstName={firstName} />
              </Suspense>
            </DashboardSectionErrorBoundary>
          ) : (
            <DashboardHeaderShell firstName={firstName} />
          )}

          <StudentDashboardContent sections={{
            primary: <>
                <DashboardSectionErrorBoundary
                  variant="primary"
                  sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.classesActive" />}
                >
                  <Suspense fallback={<DashboardPrimaryLearningSkeleton count={enrollments.length} />}>
                    <PrimaryLearningSection userId={user?.id} enrollments={enrollments} />
                  </Suspense>
                </DashboardSectionErrorBoundary>

                {user?.id && (
                  <DashboardSectionErrorBoundary
                    variant="secondary"
                    sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />}
                  >
                    <Suspense fallback={null}>
                      <RecommendedCoursesSection user={user} enrolledCourseIds={enrolledCourseIds} />
                    </Suspense>
                  </DashboardSectionErrorBoundary>
                )}
            </>,
            secondary: <>
                <DashboardSectionErrorBoundary
                  variant="secondary"
                  sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />}
                >
                  <Suspense fallback={<DashboardSectionSkeleton rows={3} />}>
                    <ReviewQueueSection userId={user?.id} enrollments={enrollments} />
                  </Suspense>
                </DashboardSectionErrorBoundary>

                <DashboardSectionErrorBoundary variant="secondary">
                  <Suspense fallback={<DashboardSectionSkeleton rows={2} />}>
                    <WeakConceptsSection userId={user?.id} firstCourse={enrollments[0]} />
                  </Suspense>
                </DashboardSectionErrorBoundary>

                <DashboardSectionErrorBoundary
                  variant="secondary"
                  sectionTitle={<TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />}
                >
                  <Suspense fallback={<DashboardSectionSkeleton rows={2} />}>
                    <AvailableAssessmentsSection enrollments={enrollments} />
                  </Suspense>
                </DashboardSectionErrorBoundary>
            </>,
          }} />
        </>
      )}
    </ApplicationPage>
  );
}
