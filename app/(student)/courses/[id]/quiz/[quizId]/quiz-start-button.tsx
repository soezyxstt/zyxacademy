"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type QuizStartButtonProps = {
  courseId: string;
  templateId: string;
  label?: string;
  className?: string;
  /** Override the post-start redirect (defaults to the standard course quiz URL). */
  getRedirectPath?: (attemptId: string) => string;
};

export function QuizStartButton({ courseId, templateId, label = "Mulai Kuis", className, getRedirectPath }: QuizStartButtonProps) {
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
        body: JSON.stringify({ templateId }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Gagal memulai kuis");
      }

      const data = await res.json();
      toast.success("Kuis dimulai! Semoga berhasil.");
      const path = getRedirectPath ? getRedirectPath(data.attemptId) : `/courses/${courseId}/quiz/${templateId}?attemptId=${data.attemptId}`;
      router.push(path);
    } catch (err: any) {
      toast.error(err.message || "Gagal memulai kuis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleStart}
      disabled={loading}
      className={cn("bg-brand-primary text-white hover:bg-brand-primary/95 font-bold rounded-md interactive shadow-sm px-6 py-2 flex items-center gap-2 cursor-pointer", className)}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Memuat...
        </>
      ) : (
        <>
          <Play className="size-4 fill-white" />
          {label}
        </>
      )}
    </Button>
  );
}
