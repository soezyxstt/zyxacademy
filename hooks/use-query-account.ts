"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { removeOtherAccounts } from "@/lib/query/client";

/** Use in authenticated query consumers, not public/demo providers. */
export function useQueryAccount() {
  const { data, isPending } = useSession();
  const client = useQueryClient();
  const userId = data?.user.id ?? null;
  useEffect(() => {
    if (!isPending) removeOtherAccounts(client, userId);
  }, [client, isPending, userId]);
  return userId;
}
