"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { listenToDialogHistory, syncDialogHistory } from "@/hooks/use-dialog-history";

function SyncDialogUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(syncDialogHistory, [pathname, searchParams]);
  return null;
}

export function DialogHistoryRuntime() {
  useEffect(listenToDialogHistory, []);
  return <Suspense fallback={null}><SyncDialogUrl /></Suspense>;
}
