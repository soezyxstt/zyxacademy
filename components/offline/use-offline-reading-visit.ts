"use client";

import { useEffect, useRef } from "react";
import { subscribeAccountTransition } from "@/lib/auth/account-transition-state";
import { useAppLocale } from "@/lib/i18n/client";
import { captureOfflineScope, isOfflineAccountKnown, isOfflineScopeCurrent, subscribeOfflineScope } from "@/lib/offline/cache-scope";
import { cacheReadingOnOpen } from "@/lib/offline/sync-client";

/** A mounted reader identity represents one visit, including refreshes of its document props. */
export function useOfflineReadingVisit(userId: string | undefined, courseId: string, materialId: string, kind: "article" | "diktat") {
  const { locale } = useAppLocale();
  const lastVisit = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) {
      lastVisit.current = null;
      return;
    }
    const visit = () => {
      if (!isOfflineAccountKnown()) return;
      const token = captureOfflineScope(userId);
      if (!token || token.scope.locale !== locale || !isOfflineScopeCurrent(token)) return;
      const identity = JSON.stringify([token.scope.scopeKey, courseId, materialId, kind]);
      if (lastVisit.current === identity) return;
      const visitId = crypto.randomUUID?.();
      if (!visitId) return;
      lastVisit.current = identity;
      void cacheReadingOnOpen(token, { kind, id: materialId, courseId }, visitId);
    };
    const unsubscribeScope = subscribeOfflineScope(visit);
    const unsubscribeTransition = subscribeAccountTransition(visit);
    visit();
    return () => { unsubscribeScope(); unsubscribeTransition(); };
  }, [userId, locale, courseId, materialId, kind]);
}
