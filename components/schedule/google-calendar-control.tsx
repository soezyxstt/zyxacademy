"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarSync, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { connectGoogleCalendar, getGoogleCalendarStatus, requestGoogleCalendarSync } from "@/app/actions/google-calendar";
import type { CalendarSyncStatus } from "@/lib/google-calendar/shared";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  getNativeAuthScheme,
  isNativeSystemBrowserSupported,
  openNativeSystemBrowser,
} from "@/lib/native/auth";

export function GoogleCalendarControl({ central = false }: { central?: boolean }) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<CalendarSyncStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [callbackFailed, setCallbackFailed] = useState(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const hasStatus = status !== null;
  const syncPending = status?.pending === true;
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (document.hidden || running || busy) return;
      running = true;
      clearTimeout(timer);
      let pending = syncPending;
      try {
        const next = await getGoogleCalendarStatus(central);
        pending = next.pending;
        if (active) { setStatus(next); setFailed(false); }
      } catch { if (active) setFailed(true); }
      finally {
        running = false;
        if (active && pending && !document.hidden) timer = setTimeout(refresh, 10000);
      }
    }
    if (open || !hasStatus || syncPending) void refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [central, open, busy, hasStatus, syncPending]);
  useEffect(() => {
    if (central) return;
    const url = new URL(window.location.href);
    const callback = url.searchParams.get("calendarSync");
    if (!callback) return;
    url.searchParams.delete("calendarSync");
    window.history.replaceState(null, "", url);
    if (callback === "error") { setCallbackFailed(true); return; }
    void requestGoogleCalendarSync(false).then(async result => {
      if (!result.ok) setCallbackFailed(true);
      setStatus(await getGoogleCalendarStatus(false));
    }).catch(() => setCallbackFailed(true));
  }, [central]);
  async function submit() {
    setBusy(true); setFailed(false); setCallbackFailed(false);
    let keepBusyForBrowser = false;
    try {
      if (!status) {
        setStatus(await getGoogleCalendarStatus(central));
      } else if (!central && (!status.connected || status.error === "reconnect")) {
        const nativeScheme = isNativeSystemBrowserSupported() ? getNativeAuthScheme() : null;
        const result = await connectGoogleCalendar(window.location.pathname, { nativeScheme });
        if (!result.url) throw new Error("Connection failed");
        if (result.nativeBrowser) {
          const handoffUrl = new URL(result.url, window.location.origin).toString();
          const opened = await openNativeSystemBrowser(handoffUrl, {
            onBrowserClosed: () => {
              if (!mountedRef.current) return;
              setBusy(false);
              void getGoogleCalendarStatus(central)
                .then((next) => { if (mountedRef.current) setStatus(next); })
                .catch(() => {});
            },
          });
          if (!opened) throw new Error("Native browser unavailable");
          keepBusyForBrowser = true;
          return;
        }
        window.location.assign(result.url);
      } else {
        const result = await requestGoogleCalendarSync(central);
        if (!result.ok) throw new Error("Sync failed");
        setStatus(await getGoogleCalendarStatus(central));
      }
    } catch { if (mountedRef.current) setFailed(true); }
    finally { if (!keepBusyForBrowser && mountedRef.current) setBusy(false); }
  }
  const loading = busy || status?.pending;
  const title = t(central ? "googleCalendar.central" : "googleCalendar.title");
  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={title}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <CalendarSync className="size-4" />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{title}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
          <p className="text-body-sm font-semibold">{title}</p>
          <p className="text-body-xs text-muted-foreground">{t(central ? "googleCalendar.centralHelp" : "googleCalendar.help")}</p>
          <div role="status" aria-live="polite" className="text-body-xs">
            {failed || callbackFailed ? t(!status && !callbackFailed ? "googleCalendar.statusFailed" : "googleCalendar.failed") : !status ? t("googleCalendar.loading") : !status.configured ? t("googleCalendar.setup") : status.error ? t(status.error === "reconnect" ? central ? "googleCalendar.centralReconnect" : "googleCalendar.reconnect" : "googleCalendar.failed") : status.pending ? t("googleCalendar.pending") : status.lastSyncedAt ? t("googleCalendar.lastSynced", { date: new Date(status.lastSyncedAt).toLocaleString(locale) }) : t("googleCalendar.neverSynced")}
          </div>
          <Button type="button" className="w-full text-body-sm" disabled={Boolean(loading || (!status && !failed) || (central && status && !status.configured))} onClick={submit}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t(!status ? "googleCalendar.retryStatus" : !central && (!status.connected || status.error === "reconnect") ? "googleCalendar.connect" : "googleCalendar.sync")}
          </Button>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
