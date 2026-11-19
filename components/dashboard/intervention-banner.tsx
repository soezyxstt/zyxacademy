"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { dismissInterventionMutation, studentInterventionsQuery } from "@/lib/student/interventions-query";

export function InterventionBanner() {
  const userId = useQueryAccountId();
  return userId ? <AccountInterventionBanner key={userId} userId={userId} /> : null;
}

function AccountInterventionBanner({ userId }: { userId: string }) {
  const t = useTranslations("student");
  const client = useQueryClient();
  const query = useQuery(studentInterventionsQuery(userId));
  const mutation = useMutation(dismissInterventionMutation(client, userId));
  const interventions = query.isError ? [] : query.data ?? [];
  const [isExiting, setIsExiting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(dismissTimer.current), []);

  if (removed || interventions.length === 0) {
    return null;
  }

  // Render only the newest
  const active = interventions[0];
  const { conceptName, reason, payload, courseId, id } = active;

  const dismiss = () => {
    if (mutation.isPending || isExiting) return;
    mutation.mutate(id, {
      onSuccess: () => {
        setIsExiting(true);
        dismissTimer.current = setTimeout(() => setRemoved(true), 200);
      },
    });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-status-warning shrink-0" />
          <p className="text-body-base font-medium text-foreground">
            {t("dashboard.intervention.repeat", { concept: conceptName })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-muted-foreground capitalize">{reason}</span>
        </div>
      </div>

      {/* Row 2 */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg bg-background/80 text-body-sm">
            <Link href={reviewModuleHref}>
              {t("dashboard.intervention.readMaterial")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg bg-background/80 text-body-sm">
            <Link href={practiceQuizHref}>
              {t("dashboard.intervention.practiceQuiz")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg bg-background/80 text-body-sm">
            <Link href={flashcardHref}>
              {t("dashboard.intervention.flashcards", { count: payload.flashcardCount })}
            </Link>
          </Button>

          {extraCount > 0 && (
            <Button variant="ghost" size="sm" asChild className="h-8 rounded-lg text-body-sm text-muted-foreground">
              <Link href={`/courses/${courseId}`}>
                +{t("dashboard.intervention.more", { count: extraCount })}
              </Link>
            </Button>
          )}
        </div>

        {/* Row 3 / Dismiss */}
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          disabled={mutation.isPending || isExiting}
          aria-busy={mutation.isPending}
          className="text-body-sm text-muted-foreground hover:text-foreground h-8 px-2 rounded-md"
        >
          {t("dashboard.intervention.dismiss")}
        </Button>
      </div>
      {mutation.isError && <p role="alert" className="mt-2 text-body-sm text-status-error">{t("dashboard.intervention.dismissFailed")}</p>}
    </div>
  );
}
