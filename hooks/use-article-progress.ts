"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQueryAccount } from "./use-query-account";
import { articleProgressMutation } from "@/lib/articles/progress-client";

export function useArticleProgress(articleId: string, version: number) {
  const userId = useQueryAccount();
  const scope = JSON.stringify([userId, articleId, version]);
  const { mutateAsync } = useMutation(articleProgressMutation(articleId, version, userId));
  const [boundScope, setBoundScope] = useState(scope);
  // Query updates observer options in an effect. A child's completion effect
  // must wait until that observer has adopted the resolved account and article.
  useEffect(() => { setBoundScope(scope); }, [scope]);
  return userId && boundScope === scope ? mutateAsync : undefined;
}
