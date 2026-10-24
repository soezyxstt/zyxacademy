"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface Intervention {
  id: string;
  studentId: string;
  courseId: string;
  conceptName: string;
  reason: string;
  status: "active" | "dismissed" | "resolved";
  payload: {
    moduleHref: string;
    quizTemplateIds: string[];
    flashcardCount: number;
  };
  createdAt: string;
}

export function InterventionBanner() {
  const t = useTranslations("student");
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isExiting, setIsExiting] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    fetch("/api/student/interventions")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setInterventions(data))
      .catch(() => {});
  }, []);

  if (removed || interventions.length === 0) {
    return null;
  }

  // Render only the newest
  const active = interventions[0];
  const { conceptName, reason, payload, courseId, id } = active;

  const dismiss = async () => {
    setIsExiting(true);
    try {
      await fetch(`/api/student/interventions/${id}/dismiss`, {
        method: "POST",
      });
      setTimeout(() => {
        setRemoved(true);
      }, 200);
    } catch {
      setIsExiting(false);
    }
  };

  // Links resolution
  const reviewModuleHref = payload.moduleHref || `/courses/${courseId}`;
  
  const practiceQuizHref =
    payload.quizTemplateIds && payload.quizTemplateIds.length > 0
      ? `/courses/${courseId}/quiz/${payload.quizTemplateIds[0]}`
      : `/courses/${courseId}/quiz`;

  const flashcardHref = `/courses/${courseId}/flashcard`;

  const extraCount = interventions.length - 1;

  return (
    <div
      className={cn(
        "border-l-4 border-status-warning bg-status-warning/10 rounded-md px-4 py-3 mb-6 transition-all duration-200",
        isExiting ? "animate-out fade-out duration-200" : "animate-in fade-in duration-300"
      )}
    >
      {/* Row 1 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-status-warning shrink-0" />
          <p className="text-body-base font-medium text-foreground">
            {t("dashboard.intervention.repeat", { concept: conceptName })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-body-sm text-muted-foreground capitalize">{reason}</span>
        </div>
      </div>

      {/* Row 2 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-body-sm text-primary">
          <Link href={reviewModuleHref} className="hover:underline font-medium">
            {t("dashboard.intervention.readMaterial")}
          </Link>
          <Link href={practiceQuizHref} className="hover:underline font-medium">
            {t("dashboard.intervention.practiceQuiz")}
          </Link>
          <Link href={flashcardHref} className="hover:underline font-medium">
            {t("dashboard.intervention.flashcards", { count: payload.flashcardCount })}
          </Link>
          
          {extraCount > 0 && (
            <span className="text-body-sm text-muted-foreground">
              +
              <Link href={`/courses/${courseId}`} className="hover:underline font-medium text-muted-foreground ml-0.5">
                {t("dashboard.intervention.more", { count: extraCount })}
              </Link>
            </span>
          )}
        </div>

        {/* Row 3 / Dismiss */}
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="text-body-sm text-muted-foreground hover:text-foreground h-8 px-2 rounded-md"
        >
          {t("dashboard.intervention.dismiss")}
        </Button>
      </div>
    </div>
  );
}
