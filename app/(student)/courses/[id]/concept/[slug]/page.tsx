import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb, Lock } from "lucide-react";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseConceptExplorerSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { createMetadata } from "@/lib/site";
import { getConceptExplorerData, type ConceptRef } from "@/lib/concept-explorer-service";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string; slug: string }> };

const TYPE_LABELS: Record<string, string> = {
  definition: "definition",
  formula: "formula",
  example: "example",
  misconception: "misconception",
  exercise: "exercise",
  summary: "summary",
  objective: "objective",
  concept_overview: "conceptOverview",
};

const TYPE_ORDER = ["concept_overview", "definition", "formula", "example", "misconception", "exercise", "objective", "summary"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const course = await getCourse(id);
  const data = await getConceptExplorerData(id, slug);
  const t = await getTranslations("learning");

  const title = data ? `${data.conceptName} (${course?.title ?? ""})` : t("metadata.conceptTitleFallback");
  return createMetadata({
    title,
    description: data ? t("metadata.conceptDescription", { concept: data.conceptName }) : t("metadata.conceptDescriptionFallback"),
    path: `/courses/${id}/concept/${slug}`,
  });
}

function ConceptLinkRow({ courseId, refs }: { courseId: string; refs: ConceptRef[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {refs.map((r) => (
        <Link key={r.slug} href={`/courses/${courseId}/concept/${r.slug}`}>
          <Badge variant="secondary" className="rounded-md hover:bg-muted cursor-pointer">
            <MathText as="span">{r.conceptName}</MathText>
          </Badge>
        </Link>
      ))}
    </div>
  );
}

async function ConceptExplorerContent({
  id,
  dataPromise,
}: {
  id: string;
  dataPromise: Promise<Awaited<ReturnType<typeof getConceptExplorerData>>>;
}) {
  const data = await dataPromise;

  if (!data) {
    return (
      <Reveal>
        <div className={studentCardClass()}>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
              <Lock className="size-5" />
            </div>
            <div>
              <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="courseAccess.needToken" /></h3>
              <p className="mt-1 text-body-sm text-muted-foreground"><TranslatedText namespace="learning" messageKey="conceptPage.activateToExplore" /></p>
            </div>
          </div>
          <div className="mt-4">
            <EnrollmentForm />
          </div>
        </div>
      </Reveal>
    );
  }

  const typesPresent = TYPE_ORDER.filter((t) => data.kosByType[t as keyof typeof data.kosByType]?.length);

  return (
    <div className="space-y-8">
      {/* Mastery + prerequisite/related summary */}
      <Reveal>
        <div className={studentCardClass("space-y-4")}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-body-base font-heading font-semibold text-foreground"><MathText as="span">{data.conceptName}</MathText></h2>
            {typeof data.masteryScore === "number" && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-32 rounded-md bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-md bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${data.masteryScore}%` }}
                  />
                </div>
                <span className="text-body-sm text-muted-foreground tabular-nums">{data.masteryScore}%</span>
              </div>
            )}
          </div>

          {data.prerequisites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider"><TranslatedText namespace="learning" messageKey="conceptPage.prerequisites" /></p>
              <ConceptLinkRow courseId={id} refs={data.prerequisites} />
            </div>
          )}

          {data.unlocks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider"><TranslatedText namespace="learning" messageKey="conceptPage.unlocks" /></p>
              <ConceptLinkRow courseId={id} refs={data.unlocks} />
            </div>
          )}

          {data.related.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider"><TranslatedText namespace="learning" messageKey="conceptPage.related" /></p>
              <ConceptLinkRow courseId={id} refs={data.related} />
            </div>
          )}
        </div>
      </Reveal>

      {/* Content grouped by type */}
      {typesPresent.map((type) => {
        const items = data.kosByType[type as keyof typeof data.kosByType] ?? [];
        return (
          <Reveal key={type}>
            <section aria-labelledby={`${type}-heading`}>
              <h2 id={`${type}-heading`} className="text-body-base font-semibold mb-3">
                {TYPE_LABELS[type] ? <TranslatedText namespace="learning" messageKey={`conceptPage.types.${TYPE_LABELS[type]}`} /> : type}
              </h2>
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                {items.map((ko) => (
                  <div key={ko.id} className="p-4">
                    <h3 className="text-body-base font-semibold text-foreground mb-2"><MathText as="span">{ko.title}</MathText></h3>
                    <MarkdownRenderer content={ko.content} />
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}

async function ConceptTitle({ dataPromise, courseTitle }: {
  dataPromise: Promise<Awaited<ReturnType<typeof getConceptExplorerData>>>;
  courseTitle: string;
}) {
  const data = await dataPromise;
  return data?.conceptName ?? <TranslatedText namespace="learning" messageKey="conceptPage.title" values={{ course: courseTitle }} />;
}

export default async function ConceptExplorerPage({ params }: Props) {
  const { id, slug } = await params;

  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);
  if (!course) notFound();

  const dataPromise = checkFullCourseContentAccess(id).then(async (hasFullContentAccess) => {
    if (!hasFullContentAccess) return null;
    const data = await getConceptExplorerData(id, slug, session?.user?.id);
    if (!data) notFound();
    return data;
  });

  return (
    <CoursePageShell
      title={<Suspense fallback={<span className="block h-7 w-48 animate-pulse rounded-md bg-muted" />}><ConceptTitle dataPromise={dataPromise} courseTitle={course.title} /></Suspense>}
      description={<TranslatedText namespace="learning" messageKey="conceptPage.description" values={{ course: course.title }} />}
      icon={Lightbulb}
    >
      <Suspense fallback={<CourseConceptExplorerSkeleton />}>
        <ConceptExplorerContent id={id} dataPromise={dataPromise} />
      </Suspense>
    </CoursePageShell>
  );
}
