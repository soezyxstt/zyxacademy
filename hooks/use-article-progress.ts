"use client";

import { useMutation } from "@tanstack/react-query";
import { useQueryAccount } from "./use-query-account";
import { articleProgressMutation } from "@/lib/articles/progress-client";

export function useArticleProgress(articleId: string, version: number) {
  const userId = useQueryAccount();
  const { mutateAsync } = useMutation(articleProgressMutation(articleId, version, userId));
  return userId ? mutateAsync : undefined;
}
