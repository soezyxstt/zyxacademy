"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

type QuizStartButtonProps = {
  courseId: string;
  templateId: string;
  label?: string;
  className?: string;
  /** Override the post-start redirect (defaults to the standard course quiz URL). */
  getRedirectPath?: (attemptId: string) => string;
  /** Serializable variant of getRedirectPath for server-component callers; `?attemptId=` is appended. */
  redirectBasePath?: string;
};

export function QuizStartButton({ courseId, templateId, label = "Mulai Kuis", className, getRedirectPath, redirectBasePath }: QuizStartButtonProps) {
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
        let message = "Gagal memulai kuis";
        try {
          const errData = await res.json();
          if (errData?.error) message = typeof errData.error === "string" ? errData.error : "Terjadi kesalahan";
        } catch { /* empty or non-JSON body */ }
        throw new Error(message);
      }

      let data: { attemptId?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        throw new Error("Respons server tidak valid. Silakan coba lagi.");
      }
      if (!data?.attemptId) {
        throw new Error("Respons server tidak lengkap. Silakan coba lagi.");
      }
      toast.success("Kuis dimulai! Semoga berhasil.");
      const path = getRedirectPath
        ? getRedirectPath(data.attemptId)
        : redirectBasePath
          ? `${redirectBasePath}?attemptId=${data.attemptId}`
          : `/courses/${courseId}/quiz/${templateId}?attemptId=${data.attemptId}`;
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
      isLoading={loading}
      className={cn("bg-brand-primary text-white hover:bg-brand-primary/95 font-bold rounded-md interactive shadow-sm px-6 py-2 flex items-center gap-2 cursor-pointer", className)}
    >
      <Play className="size-4 fill-white" />
      {label}
    </Button>
  );
}
