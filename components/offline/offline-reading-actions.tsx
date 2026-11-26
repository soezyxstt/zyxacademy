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
export function OfflineReadingActions({ userId, courseId, materialId, kind }: { userId?: string; courseId: string; materialId: string; kind: "article" | "diktat" }) {
  const { locale } = useAppLocale();
  const t = copy[locale];
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
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeKey: string; change: OfflineChange }>).detail;
      const scope = getOfflineScope(userId);
      if (!detail || scope?.locale !== locale || detail.scopeKey !== scope.scopeKey) return;
      const change = detail.change;
      const matchingMaterial = change.kind === kind && change.resourceId === materialId;
      const matchingCourse = change.kind === "course" && (!change.courseId || change.courseId === courseId);
      if ((matchingMaterial || matchingCourse) && change.action === "delete") { setUpdated(false); startRefresh(() => router.refresh()); }
      else if (matchingMaterial || matchingCourse) setUpdated(true);
      if ((change.kind === "access" || change.kind === "enrollments") && (!change.courseId || change.courseId === courseId)) {
        // An access change uses the authoritative route immediately; its role
        // and course gates must not wait for someone to accept a content update.
        startRefresh(() => router.refresh());
      }
    };
    window.addEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed);
    return () => { unsubscribe(); unwatch?.(); window.removeEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed); };
  }, [userId, courseId, materialId, kind, locale, router]);
  if (!userId) return null;
  return <>
    {updated && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t.update} disabled={refreshing} onClick={() => { setUpdated(false); startRefresh(() => router.refresh()); }}><RefreshCw className={refreshing ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />{t.newVersion}</Button></TooltipTrigger><TooltipContent>{t.update}</TooltipContent></Tooltip>}
    <span role="status" className="sr-only">{updated ? t.update : ""}</span>
  </>;
}
