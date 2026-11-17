"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { allowanceQuery } from "@/lib/query/allowance";
import { useQueryAccount } from "./use-query-account";

export function useZyraAllowance(courseId: string | null | undefined, refreshKey: number) {
  const userId = useQueryAccount();
  const client = useQueryClient();
  const query = useQuery(allowanceQuery(userId, courseId));
  const previous = useRef({ userId, courseId, refreshKey });
  useEffect(() => {
    const old = previous.current;
    previous.current = { userId, courseId, refreshKey };
    if (userId && old.userId === userId && old.courseId === courseId && old.refreshKey !== refreshKey) {
      void client.invalidateQueries({ queryKey: allowanceQuery(userId, courseId).queryKey, exact: true });
    }
  }, [client, userId, courseId, refreshKey]);
  return query.isError ? undefined : query.data;
}
