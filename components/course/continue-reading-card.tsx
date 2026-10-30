"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContinueReadingData } from "@/types/course-learning";
import { studentCardClass } from "@/components/course/course-surfaces";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export function ContinueReadingSkeleton() {
  return (
    <div className={cn(studentCardClass(), "flex flex-col justify-between gap-3")}>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="size-5 bg-muted rounded-md animate-pulse" />
          <div className="h-5 w-36 bg-muted rounded-md animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-5 w-3/4 bg-muted rounded-md animate-pulse" />
          <div className="h-4 w-1/2 bg-muted rounded-md animate-pulse" />
          <div className="space-y-1.5 pt-2">
            <div className="h-1.5 w-full bg-muted rounded-md animate-pulse" />
            <div className="h-3 w-16 bg-muted rounded-md animate-pulse" />
          </div>
        </div>
      </div>
      <div className="h-9 w-full bg-muted rounded-md animate-pulse mt-4" />
    </div>
  );
}

interface ContinueReadingCardProps {
  courseId: string;
  data: ContinueReadingData | null;
  isLoading?: boolean;
}

export function ContinueReadingCard({
  courseId,
  data,
  isLoading = false,
}: ContinueReadingCardProps) {
  const t = useTranslations("studentCourse");
  if (isLoading) {
    return <ContinueReadingSkeleton />;
  }

  const isEmpty = !data;

  return (
    <div className={cn(studentCardClass(), "flex flex-col justify-between gap-3")}>
      <div>
        <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-3">
          <BookOpen className="size-4.5 text-brand-primary" aria-hidden="true" />
          {t("course.continueReading.title")}
        </h3>

        {!isEmpty ? (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <p className="text-body-sm font-semibold text-foreground truncate" title={data.materialTitle}>
                <MathText as="span">{data.materialTitle}</MathText>
              </p>
              <p className="text-body-xs text-muted-foreground mt-0.5 truncate" title={data.chapterTitle}>
                {t("course.continueReading.lastSection")} <MathText as="span">{data.chapterTitle || t("course.continueReading.startOfMaterial")}</MathText>
              </p>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={data.completionPercent} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="h-full rounded bg-brand-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${data.completionPercent}%` }}
                />
              </div>
              <p className="text-body-xs text-muted-foreground">{t("course.continueReading.percentComplete", { percent: data.completionPercent })}</p>
            </div>
          </div>
        ) : (
          <div className="py-2 text-left animate-in fade-in duration-300">
            <p className="text-body-sm text-muted-foreground">{t("course.continueReading.empty")}</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        {!isEmpty ? (
          (() => {
            let query = "";
            if (data.lastPosition) {
              if (data.lastPosition.type === "pdf" && data.lastPosition.page) {
                query = `?page=${data.lastPosition.page}`;
              } else if (data.lastPosition.type === "article" && data.lastPosition.section) {
                query = `?section=${data.lastPosition.section}`;
              }
            } else if (data.lastSectionId) {
              query = `?section=${encodeURIComponent(data.lastSectionId)}`;
            }
            return (
              <Link
                href={`/courses/${courseId}/material/${data.materialId}${query}`}
                aria-label={t("course.continueReading.continueNamed", { title: data.materialTitle })}
              >
                <Button size="sm" className="rounded-md w-full bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 transition-colors duration-150">
                  {t("course.continueReading.continue")}
                </Button>
              </Link>
            );
          })()
        ) : (
          <Link href={`/courses/${courseId}/material`} aria-label={t("course.continueReading.startAria")}>
            <Button size="sm" variant="outline" className="rounded-md w-full transition-colors duration-150">
              {t("course.continueReading.start")}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
