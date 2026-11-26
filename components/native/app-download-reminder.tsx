"use client";

import Link from "next/link";
import { useOnboardingTour } from "@/components/onboarding/tour-context";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { closeDialogsThen } from "@/hooks/use-dialog-history";
import { StudentAccountBoundary, type StudentAccountState } from "@/components/student-account-boundary";
import { useTranslations } from "@/lib/i18n/client";
import { isNativeApp } from "@/lib/native/runtime";
import { checkLatestAppRelease, selectDownloadUrlForPlatform, type AppUpdateChannel } from "@/lib/native/updates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REMINDER_INTERVAL = 30 * 24 * 60 * 60 * 1000;

export function AppDownloadReminder({ channel }: { channel: AppUpdateChannel }) {
  const pathname = usePathname();
  if (pathname !== "/dashboard" && pathname !== "/tutor") return null;
  return <StudentAccountBoundary>{({ data }) => data &&
    <DashboardReminder key={data.user.id} user={data.user} channel={channel} />
  }</StudentAccountBoundary>;
}

function DashboardReminder({ user, channel }: { user: NonNullable<StudentAccountState["data"]>["user"]; channel: AppUpdateChannel }) {
  const tour = useOnboardingTour();
  const roles = [user.role, ...(user.roles ?? [])];
  const eligible = !roles.includes("admin") && roles.some(role => ["murid", "student", "tutor", "teacher"].includes(role ?? ""));
  const userId = eligible ? user.id : undefined;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("student.preferences");

  useEffect(() => {
    if (!userId || isNativeApp() || tour.blocking) return;
    const ua = navigator.userAgent;
    const platform = /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : /Linux/i.test(ua) ? "linux" : null;
    if (!platform) return;
    const key = `zyx:download-reminder:${userId}`;
    let cancelled = false;
    const canShow = () => !cancelled && document.visibilityState === "visible" &&
      !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') &&
      Date.now() - Number(localStorage.getItem(key) ?? 0) >= REMINDER_INTERVAL;
    const timer = window.setTimeout(async () => {
      try {
        if (!canShow()) return;
        const result = await checkLatestAppRelease(channel);
        if (result.status !== "ok" || !selectDownloadUrlForPlatform(result.release, platform) || !canShow()) return;
        localStorage.setItem(key, String(Date.now()));
        setOpenFor(userId);
      } catch {
        // Skip the prompt when this browser cannot remember the cooldown.
      }
    }, 30_000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [channel, userId, tour.blocking]);

  if (!userId || openFor !== userId || tour.blocking) return null;
  return (
    <Dialog open onOpenChange={open => { if (!open) setOpenFor(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appIntroTitle")}</DialogTitle>
          <DialogDescription>{t("appIntroDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenFor(null)}>{t("appIntroLater")}</Button>
          <Button asChild>
            <Link href="/download" onNavigate={event => {
              event.preventDefault();
              closeDialogsThen(() => setOpenFor(null), () => router.push("/download"));
            }}>{t("downloadApp")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
