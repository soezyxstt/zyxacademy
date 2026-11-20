"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generateChapterSummary } from "@/lib/materials/client-api";
import type { ChapterSummary } from "@/lib/materials/client-contracts";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { ApiError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

export function useChapterSummary({ studentId, chapterId, chapterTitle, demo }: {
  studentId?: string;
  chapterId: string;
  chapterTitle: string;
  demo: boolean;
}) {
  const client = useQueryClient();
  const pending = useRef(false);
  const [demoSummary, setDemoSummary] = useState<ChapterSummary | null>(null);
  const mutation = useMutation({
    mutationKey: queryKeys.materials.summary(studentId ?? "", chapterId),
    mutationFn: () => {
      if (!studentId || !isQueryAccountCurrent(client, studentId)) throw new ApiError(409, "Account changed");
      return generateChapterSummary(studentId, chapterId);
    },
    retry: false,
    networkMode: "always",
  });
  const summary = demo ? demoSummary : mutation.data && !mutation.data.budgetExhausted ? mutation.data.summary : null;
  const load = async () => {
    if (summary || pending.current) return;
    if (demo) {
      setDemoSummary({ keyConcepts: [chapterTitle], commonMistakes: ["Melewatkan definisi dan syarat penggunaan konsep."], importantFormulas: [], practiceRecommendations: ["Kerjakan contoh, lalu periksa setiap langkah."] });
      return;
    }
    pending.current = true;
    try { await mutation.mutateAsync(); }
    catch { /* The sheet presents the error; generating again requires a click. */ }
    finally { pending.current = false; }
  };
  return {
    summary,
    loading: mutation.isPending,
    error: mutation.isError ? "request" as const : mutation.data?.budgetExhausted ? "budget" as const : null,
    load,
  };
}
