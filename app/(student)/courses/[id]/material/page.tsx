import { StudentDocumentsView } from "@/components/course/student-documents-view";
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CourseMaterialListSkeleton } from "@/components/course/course-skeletons";
import { createMetadata } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { loadCourseMaterialData } from "@/lib/student/course-material-list";
import { CourseDocumentsClient } from "./course-documents-client";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course ? t("metadata.materialTitle", { course: course.title }) : t("metadata.materialTitleFallback"),
    description: t("metadata.materialDescription"),
    path: `/courses/${id}/material`,
  });
}

async function CourseMaterialListContent({
  courseId,
  initialTab,
  dataPromise,
}: {
  courseId: string;
  initialTab?: string;
  dataPromise: ReturnType<typeof loadCourseMaterialData>;
}) {
  const {
    hasFullContentAccess,
    accessTier,
    materialsWithLockState,
    courseChapters,
    lockedMaterialCount,
  } = await dataPromise;

  return (
    <>
      {!hasFullContentAccess && (
        <div className="mb-3 border-l-2 border-brand-secondary/60 py-2 pl-3">
          <div className="grid gap-(--related-gap) md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
            <div>
              <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                <TranslatedText namespace="learning" messageKey="quizPage.activationTitle" />
              </h3>
              <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey="courseOverview.activationDescription" />
              </p>
            </div>
            <EnrollmentForm className="w-full" />
          </div>
        </div>
      )}
      <CourseDocumentsClient
        courseId={courseId}
        materials={materialsWithLockState}
        chapters={courseChapters}
        defaultTab={initialTab}
        accessTier={accessTier}
        lockedMaterialCount={lockedMaterialCount}
      />
    </>
  );
}

export default async function CourseMaterialListPage({ params, searchParams }: Props) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab;

  // Run session check and course lookup concurrently while preserving strict auth priority.
  const sessionPromise = getAuthSession();
  const coursePromise = getCourse(id).then(
    (data) => ({ ok: true as const, data }),
    (err: unknown) => ({ ok: false as const, error: err }),
  );

  const session = await sessionPromise;
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material`)}`);
  }

  const courseResult = await coursePromise;
  if (!courseResult.ok) {
    throw courseResult.error;
  }
  const course = courseResult.data;
  if (!course) return null;

  const materialDataPromise = loadCourseMaterialData({ id, studentId, course });
  materialDataPromise.catch(() => {});

  return (
    <StudentDocumentsView courseTitle={course.title}>
        <Suspense fallback={<CourseMaterialListSkeleton />}>
          <CourseMaterialListContent
            courseId={id}
            initialTab={initialTab}
            dataPromise={materialDataPromise}
          />
        </Suspense>
    </StudentDocumentsView>
  );
}
