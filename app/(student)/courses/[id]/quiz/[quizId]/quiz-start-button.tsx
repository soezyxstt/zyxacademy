"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import type { ReactNode } from "react";

type QuizStartButtonProps = {
  courseId: string;
  templateId: string;
  label?: ReactNode;
  className?: string;
  /** Override the post-start redirect (defaults to the standard course quiz URL). */
  getRedirectPath?: (attemptId: string) => string;
  /** Serializable variant of getRedirectPath for server-component callers; `?attemptId=` is appended. */
  redirectBasePath?: string;
};

export function QuizStartButton({ courseId, templateId, label, className, getRedirectPath, redirectBasePath }: QuizStartButtonProps) {
  const t = useTranslations("learning");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/quiz/attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId, templateId }),
      });

      if (!res.ok) {
        let message = t("quizStart.failed");
        try {
          const errData = await res.json();
          if (errData?.error && typeof errData.error !== "string") message = t("quizStart.genericError");
        } catch { /* empty or non-JSON body */ }
        throw new Error(message);
      }

      let data: { attemptId?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(t("quizStart.invalidResponse"));
      }
      if (!data?.attemptId) {
        throw new Error(t("quizStart.incompleteResponse"));
      }
      toast.success(t("quizStart.started"));
      const path = getRedirectPath
        ? getRedirectPath(data.attemptId)
        : redirectBasePath
          ? `${redirectBasePath}?attemptId=${data.attemptId}`
          : `/courses/${courseId}/quiz/${templateId}?attemptId=${data.attemptId}`;
      router.push(path);
    } catch (err: any) {
      toast.error(err.message || t("quizStart.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleStart}
      isLoading={loading}
      className={cn("bg-brand-primary text-white hover:bg-brand-primary/95 font-bold rounded-md interactive shadow-sm px-6 py-2 flex items-center gap-2 cursor-pointer", className)}
    >
      <Play className="size-4 fill-white" />
      {label ?? t("quizStart.startQuiz")}
    </Button>
  );
}
