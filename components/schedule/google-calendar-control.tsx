"use client";

import { useEffect, useState } from "react";
import { CalendarSync, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { connectGoogleCalendar, getGoogleCalendarStatus, requestGoogleCalendarSync } from "@/app/actions/google-calendar";
import type { CalendarSyncStatus } from "@/lib/google-calendar/shared";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

export function GoogleCalendarControl({ central = false }: { central?: boolean }) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const [status, setStatus] = useState<CalendarSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [callbackFailed, setCallbackFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const next = await getGoogleCalendarStatus(central);
        if (active) { setStatus(next); setFailed(false); }
      } catch { if (active) setFailed(true); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [central]);
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
    try {
      if (!central && (!status?.connected || status.error === "reconnect")) {
        const result = await connectGoogleCalendar(window.location.pathname);
        if (!result.url) throw new Error("Connection failed");
        window.location.assign(result.url);
      } else {
        const result = await requestGoogleCalendarSync(central);
        if (!result.ok) throw new Error("Sync failed");
        setStatus(await getGoogleCalendarStatus(central));
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  const loading = busy || status?.pending;
  const title = t(central ? "googleCalendar.central" : "googleCalendar.title");
  return (
    <TooltipProvider>
      <Popover>
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
            {failed || callbackFailed ? t("googleCalendar.failed") : !status ? t("googleCalendar.loading") : !status.configured ? t("googleCalendar.setup") : status.error ? t(status.error === "reconnect" ? "googleCalendar.reconnect" : "googleCalendar.failed") : status.pending ? t("googleCalendar.pending") : status.lastSyncedAt ? t("googleCalendar.lastSynced", { date: new Date(status.lastSyncedAt).toLocaleString(locale) }) : t("googleCalendar.neverSynced")}
          </div>
          <Button type="button" className="w-full text-body-sm" disabled={Boolean(loading || (!status && !failed) || (central && !status?.configured))} onClick={submit}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t(!central && (!status?.connected || status.error === "reconnect") ? "googleCalendar.connect" : "googleCalendar.sync")}
          </Button>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
