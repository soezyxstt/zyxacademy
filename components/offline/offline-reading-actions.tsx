"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RefreshCw, Check, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppLocale } from "@/lib/i18n/client";
import { isNativeApp } from "@/lib/native/runtime";
import { getOfflineScope } from "@/lib/offline/cache-scope";
import { getOfflineReading } from "@/lib/offline/reading-cache";
import { downloadOfflineReading, watchOfflineReading } from "@/lib/offline/sync-client";
import { OFFLINE_CACHE_CHANGED_EVENT, OFFLINE_RESOURCE_CHANGED_EVENT } from "@/lib/offline/library-contract";
import type { OfflineChange } from "@/lib/offline/sync-contract";

const copy = {
  id: { save: "Simpan offline", saved: "Tersimpan offline", update: "Materi diperbarui. Muat versi terbaru", newVersion: "Versi baru", retry: "Belum tersimpan. Periksa koneksi dan ruang simpan, lalu coba lagi." },
  en: { save: "Save offline", saved: "Saved offline", update: "Material updated. Load the latest version", newVersion: "New version", retry: "Not saved. Check your connection and storage, then try again." },
};
/** A content update never replaces the document while someone is reading it. */
export function OfflineReadingActions({ userId, courseId, materialId, kind }: { userId?: string; courseId: string; materialId: string; kind: "article" | "diktat" }) {
  const { locale } = useAppLocale();
  const t = copy[locale];
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const check = () => { void getOfflineReading(userId, courseId, materialId).then(record => { if (!cancelled) setSaved(Boolean(record?.pinned && record.assetsComplete && (!isNativeApp() || record.nativeMirrored))); }); };
    const unwatch = watchOfflineReading(userId, { kind, id: materialId, courseId });
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeKey: string; change: OfflineChange }>).detail;
      if (!detail || detail.scopeKey !== getOfflineScope(userId)?.scopeKey) return;
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
    check(); window.addEventListener(OFFLINE_CACHE_CHANGED_EVENT, check); window.addEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed);
    return () => { cancelled = true; unwatch(); window.removeEventListener(OFFLINE_CACHE_CHANGED_EVENT, check); window.removeEventListener(OFFLINE_RESOURCE_CHANGED_EVENT, changed); };
  }, [userId, courseId, materialId, kind, router]);
  if (!userId) return null;
  const save = async () => {
    setSaving(true); setFailed(false);
    try { const ok = await downloadOfflineReading(userId, { kind, id: materialId, courseId }); setSaved(ok); setFailed(!ok); }
    catch { setFailed(true); }
    finally { setSaving(false); }
  };
  return <TooltipProvider delayDuration={150}>
    {updated && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t.update} disabled={refreshing} onClick={() => { setUpdated(false); startRefresh(() => router.refresh()); }}><RefreshCw className={refreshing ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />{t.newVersion}</Button></TooltipTrigger><TooltipContent>{t.update}</TooltipContent></Tooltip>}
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={failed ? t.retry : saved ? t.saved : t.save} disabled={saving} onClick={() => void save()} className={failed ? "text-destructive" : "text-muted-foreground"}>{saving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : failed ? <CircleAlert className="size-4" /> : saved ? <Check className="size-4" /> : <Download className="size-4" />}</Button></TooltipTrigger><TooltipContent>{failed ? t.retry : saved ? t.saved : t.save}</TooltipContent></Tooltip>
    <span role="status" aria-live="polite" className="sr-only">{failed ? t.retry : updated ? t.update : saved ? t.saved : ""}</span>
  </TooltipProvider>;
}
