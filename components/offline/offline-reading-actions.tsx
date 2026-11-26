"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppLocale } from "@/lib/i18n/client";
import { getOfflineScope, subscribeOfflineScope } from "@/lib/offline/cache-scope";
import { watchOfflineReading } from "@/lib/offline/sync-client";
import { OFFLINE_RESOURCE_CHANGED_EVENT } from "@/lib/offline/library-contract";
import type { OfflineChange } from "@/lib/offline/sync-contract";

const copy = {
  id: { update: "Materi diperbarui. Muat versi terbaru", newVersion: "Versi baru" },
  en: { update: "Material updated. Load the latest version", newVersion: "New version" },
};
/** A content update never replaces the document while someone is reading it. */
export function useOfflineReadingActions({ userId, courseId, materialId, kind, onRevoked }: { userId?: string; courseId: string; materialId: string; kind: "article" | "diktat"; onRevoked: () => void }) {
  const { locale } = useAppLocale();
  const router = useRouter();
  const [updated, setUpdated] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    if (!userId) return;
    let unwatch: (() => void) | undefined;
    const watch = () => {
      unwatch?.();
      unwatch = getOfflineScope(userId)?.locale === locale ? watchOfflineReading(userId, { kind, id: materialId, courseId }) : undefined;
    };
    const unsubscribe = subscribeOfflineScope(watch);
    watch();
    let refreshQueued = false;
    let watching = true;
    const refresh = () => {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (watching) startRefresh(() => router.refresh());
      });
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeKey: string; change: OfflineChange }>).detail;
      const scope = getOfflineScope(userId);
      if (!detail || scope?.locale !== locale || detail.scopeKey !== scope.scopeKey) return;
      const change = detail.change;
      if (change.courseId && change.courseId !== courseId) return;
      const matchingMaterial = change.kind === kind && change.resourceId === materialId;
      const matchingCourse = change.kind === "course";
      const accessChanged = change.kind === "access" || change.kind === "enrollments";
      if ((matchingMaterial || matchingCourse || accessChanged) && change.action === "delete") {
        setUpdated(false);
        startRefresh(() => router.refresh());
        onRevoked();
      } else if (accessChanged) refresh();
      else if (matchingMaterial || matchingCourse) setUpdated(true);
    };
    window.addEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed);
    return () => { watching = false; unsubscribe(); unwatch?.(); window.removeEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed); };
  }, [userId, courseId, materialId, kind, locale, router, onRevoked]);
  return { updated: Boolean(userId && updated), refreshing, refresh: () => { setUpdated(false); startRefresh(() => router.refresh()); } };
}

export function OfflineReadingActions({ updated, refreshing, refresh }: ReturnType<typeof useOfflineReadingActions>) {
  const { locale } = useAppLocale();
  const t = copy[locale];
  return <>
    {updated && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t.update} disabled={refreshing} onClick={refresh}><RefreshCw className={refreshing ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />{t.newVersion}</Button></TooltipTrigger><TooltipContent>{t.update}</TooltipContent></Tooltip>}
    <span role="status" className="sr-only">{updated ? t.update : ""}</span>
  </>;
}
