"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { BellRing, Clock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { useSession } from "@/lib/auth-client";
import { useStudentExperience } from "@/components/student-experience-provider";
import {
  getUnifiedNotificationDeliveryStatus,
  registerUnifiedPushToken,
  requestUnifiedNotificationPermission,
  sendDesktopNativeNotification,
  type UnifiedNotificationDeliveryStatus,
} from "@/lib/native/notifications";
import {
  DEFAULT_STUDY_REMINDER_CONFIG,
  isLocalReminderSchedulingSupported,
  loadStudyReminderConfig,
  refreshUpcomingTutorSessionReminders,
  syncStudyReminderNotifications,
  type StudyReminderConfig,
} from "@/lib/native/local-reminders";
import { cn } from "@/lib/utils";
import { getCapacitor } from "@/lib/native/runtime";
import { isBrowserPushPaused } from "@/lib/firebase/messaging";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TUTOR_LEAD_OPTIONS = [15, 30, 60] as const;

function formatTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function DeviceNotificationSettings() {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const { data: session } = useSession();
  const experience = useStudentExperience();
  const isDemo = experience?.mode === "demo";
  const userId = session?.user?.id ?? null;

  const baseId = useId();
  const [status, setStatus] = useState<UnifiedNotificationDeliveryStatus | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const [testingDesktop, setTestingDesktop] = useState(false);

  const [localSupported, setLocalSupported] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<StudyReminderConfig>(
    DEFAULT_STUDY_REMINDER_CONFIG,
  );
  const [savingReminders, setSavingReminders] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (isDemo) return;
    const next = await getUnifiedNotificationDeliveryStatus();
    setStatus(next);
  }, [isDemo]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    setLocalSupported(isLocalReminderSchedulingSupported());
    if (userId) {
      setReminderConfig(loadStudyReminderConfig(userId));
    }
  }, [userId]);

  const handleEnablePush = async () => {
    if (isDemo || !userId) return;
    setEnablingPush(true);
    try {
      const perm = await requestUnifiedNotificationPermission();
      if (perm === "granted") {
        const registered = await registerUnifiedPushToken(userId, () => true);
        if (registered) {
          toast.success(t("notificationPreferences.pushEnabled"));
        } else {
          toast.error(t("notificationPreferences.pushEnableFailed"));
        }
      }
      await refreshStatus();
    } finally {
      setEnablingPush(false);
    }
  };

  const handleDesktopTest = async () => {
    if (isDemo || !userId || testingDesktop) return;
    setTestingDesktop(true);
    try {
      const accepted = await sendDesktopNativeNotification(
        t("notificationPreferences.desktopTestTitle"),
        t("notificationPreferences.desktopTestBody"),
      );
      if (accepted) toast(t("notificationPreferences.desktopTestRequested"));
      else toast.error(t("notificationPreferences.desktopTestFailed"));
      await refreshStatus();
    } finally {
      setTestingDesktop(false);
    }
  };

  const applyReminderConfig = async (nextConfig: StudyReminderConfig) => {
    const previousConfig = reminderConfig;
    const leadChanged = nextConfig.tutorLeadMinutes !== previousConfig.tutorLeadMinutes;
    setReminderConfig(nextConfig);
    if (isDemo || !userId || !localSupported) return;

    setSavingReminders(true);
    try {
      if (nextConfig.enabled) {
        const perm = await requestUnifiedNotificationPermission();
        if (perm !== "granted") {
          setReminderConfig(previousConfig);
          toast.error(t("notificationPreferences.localRemindersPermissionNeeded"));
          await refreshStatus();
          return;
        }
      }
      await syncStudyReminderNotifications(userId, nextConfig, { locale });
      if (leadChanged) {
        await refreshUpcomingTutorSessionReminders(userId, {
          locale,
          leadMinutes: nextConfig.tutorLeadMinutes,
        });
      }
      toast.success(t("notificationPreferences.localRemindersSaved"));
      await refreshStatus();
    } catch {
      setReminderConfig(previousConfig);
      toast.error(t("notificationPreferences.pushEnableFailed"));
    } finally {
      setSavingReminders(false);
    }
  };

  const permissionText = (() => {
    if (!status) return t("notificationPreferences.checkingStatus");
    switch (status.osPermission) {
      case "granted":
        return t("notificationPreferences.permissionGranted");
      case "denied":
        return t("notificationPreferences.permissionDenied");
      case "prompt":
        return t("notificationPreferences.permissionPrompt");
      default:
        return t("notificationPreferences.permissionUnsupported");
    }
  })();

  const readinessText = (() => {
    if (!status) return t("notificationPreferences.checkingStatus");
    switch (status.deliveryReadiness) {
      case "ready":
        return t("notificationPreferences.readinessReady");
      case "permission_required":
        return t("notificationPreferences.readinessPermissionRequired");
      case "permission_denied":
        return t("notificationPreferences.readinessPermissionDenied");
      case "unregistered":
        return t("notificationPreferences.readinessUnregistered");
      case "transport_inactive":
        return t("notificationPreferences.readinessTransportInactive");
      default:
        return t("notificationPreferences.readinessUnsupported");
    }
  })();

  const transportText = (() => {
    if (!status) return "";
    switch (status.transport) {
      case "apns":
        return t("notificationPreferences.transportApns");
      case "fcm":
        return t("notificationPreferences.transportFcm");
      case "desktop":
        return t("notificationPreferences.transportDesktop");
      default:
        return t("notificationPreferences.transportWebpush");
    }
  })();

  const showEnableButton =
    !isDemo &&
    status !== null &&
    (status.deliveryReadiness === "permission_required" ||
      status.deliveryReadiness === "unregistered" || (status.platform === "web" && isBrowserPushPaused()));

  const enableReminderId = `${baseId}-local-reminder-enabled`;
  const timeInputId = `${baseId}-local-reminder-time`;
  const freqId = `${baseId}-local-reminder-frequency`;
  const leadId = `${baseId}-tutor-lead`;

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${baseId}-device-heading`}>
        <header className="border-b border-border/40 pb-2">
          <h2
            id={`${baseId}-device-heading`}
            className="font-heading text-body-base font-bold text-foreground"
          >
            {t("notificationPreferences.deviceSectionTitle")}
          </h2>
        </header>

        <div className="divide-y divide-border/30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
            <div className="flex min-w-0 items-center gap-3">
              <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-body-sm font-medium text-foreground">
                {t("notificationPreferences.osPermissionLabel")}
              </span>
            </div>
            <span className="text-body-xs font-medium text-muted-foreground">
              {permissionText}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
            <div className="flex min-w-0 items-center gap-3">
              <BellRing className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <span className="block text-body-sm font-medium text-foreground">
                  {t("notificationPreferences.deliveryReadinessLabel")}
                </span>
                {transportText ? (
                  <span className="block text-body-xs text-muted-foreground">
                    {t("notificationPreferences.transportLabel")}: {transportText}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "text-body-xs font-medium",
                  status?.deliveryReadiness === "ready"
                    ? "text-status-success"
                    : "text-muted-foreground",
                )}
              >
                {readinessText}
              </span>
              {showEnableButton ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-body-sm"
                  disabled={enablingPush}
                  onClick={() => void handleEnablePush()}
                >
                  {t("notificationPreferences.enablePush")}
                </Button>
              ) : null}
              {!isDemo && status?.platform === "desktop" && status.osPermission === "granted" ? (
                <Button type="button" size="sm" variant="outline"
                  disabled={testingDesktop} onClick={() => void handleDesktopTest()}>
                  {t("notificationPreferences.desktopTest")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {!isDemo && status?.platform === "android" && status.deliveryReadiness === "ready" && (
          <div className="space-y-2 px-3 py-3 border-t border-border/30">
            <p className="text-body-sm font-medium">{locale === "en" ? "Already receiving Chrome notifications?" : "Masih menerima notifikasi Chrome?"}</p>
            <p className="text-body-xs text-muted-foreground">{locale === "en" ? "If you enabled push in Chrome before installing the app, stop the old browser subscription here without affecting other devices." : "Jika Anda pernah mengaktifkan notifikasi Chrome sebelum memasang aplikasi, hentikan notifikasi lama di browser tanpa memengaruhi perangkat lain."}</p>
            <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left" onClick={async () => {
              try {
                const browser = getCapacitor()?.Plugins?.Browser;
                if (!browser) throw Error("BROWSER_UNAVAILABLE");
                await browser.open({url: new URL("/settings/notifications/browser", window.location.origin).href});
              } catch { toast.error(locale === "en" ? "Could not open the browser" : "Browser belum berhasil dibuka"); }
            }}>{locale === "en" ? "Stop Chrome notifications" : "Hentikan notifikasi Chrome"}</Button>
          </div>
        )}
      </section>

      <section aria-labelledby={`${baseId}-local-heading`}>
        <header className="border-b border-border/40 pb-2">
          <h2
            id={`${baseId}-local-heading`}
            className="font-heading text-body-base font-bold text-foreground"
          >
            {t("notificationPreferences.localRemindersTitle")}
          </h2>
        </header>

        {!localSupported ? (
          <p className="px-3 py-3 text-body-xs text-muted-foreground">
            {t("notificationPreferences.localRemindersMobileOnly")}
          </p>
        ) : (
          <div className="divide-y divide-border/30">
            <div className="flex items-center justify-between gap-4 px-3 py-(--row-padding)">
              <label
                htmlFor={enableReminderId}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
              >
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-body-sm font-medium text-foreground">
                  {t("notificationPreferences.localRemindersEnable")}
                </span>
              </label>
              <Switch
                id={enableReminderId}
                checked={reminderConfig.enabled}
                disabled={savingReminders}
                onCheckedChange={(checked) =>
                  void applyReminderConfig({ ...reminderConfig, enabled: checked === true })
                }
              />
            </div>

            {reminderConfig.enabled ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
                  <label htmlFor={freqId} className="text-body-sm font-medium text-foreground">
                    {t("notificationPreferences.localRemindersFrequency")}
                  </label>
                  <Select
                    value={reminderConfig.frequency}
                    disabled={savingReminders}
                    onValueChange={(value) => {
                      if (value !== "daily" && value !== "weekly") return;
                      void applyReminderConfig({ ...reminderConfig, frequency: value });
                    }}
                  >
                    <SelectTrigger id={freqId} className="w-40 text-body-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="daily">
                        {t("notificationPreferences.localRemindersDaily")}
                      </SelectItem>
                      <SelectItem value="weekly">
                        {t("notificationPreferences.localRemindersWeekly")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
                  <label htmlFor={timeInputId} className="text-body-sm font-medium text-foreground">
                    {t("notificationPreferences.localRemindersTime")}
                  </label>
                  <Input
                    id={timeInputId}
                    type="time"
                    className="w-40 text-body-sm"
                    disabled={savingReminders}
                    value={formatTimeValue(reminderConfig.hour, reminderConfig.minute)}
                    onChange={(event) => {
                      const [hStr, mStr] = event.target.value.split(":");
                      const hour = Number(hStr);
                      const minute = Number(mStr);
                      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
                      void applyReminderConfig({ ...reminderConfig, hour, minute });
                    }}
                  />
                </div>

                {reminderConfig.frequency === "weekly" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
                    <span className="text-body-sm font-medium text-foreground">
                      {t("notificationPreferences.localRemindersDays")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((day) => {
                        const selected = reminderConfig.weekdays.includes(day);
                        return (
                          <Button
                            key={day}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            className="h-8 px-2.5 text-body-sm"
                            disabled={savingReminders}
                            aria-pressed={selected}
                            onClick={() => {
                              const nextDays = selected
                                ? reminderConfig.weekdays.filter((d) => d !== day)
                                : [...reminderConfig.weekdays, day];
                              if (nextDays.length === 0) return;
                              void applyReminderConfig({ ...reminderConfig, weekdays: nextDays });
                            }}
                          >
                            {t(`notificationPreferences.weekdayShort.${day}`)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-(--row-padding)">
              <label htmlFor={leadId} className="text-body-sm font-medium text-foreground">
                {t("notificationPreferences.tutorReminderLeadLabel")}
              </label>
              <Select
                value={String(reminderConfig.tutorLeadMinutes)}
                disabled={savingReminders}
                onValueChange={(value) => {
                  const minutes = Number(value);
                  if (!Number.isInteger(minutes)) return;
                  void applyReminderConfig({ ...reminderConfig, tutorLeadMinutes: minutes });
                }}
              >
                <SelectTrigger id={leadId} className="w-56 text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {TUTOR_LEAD_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {t("notificationPreferences.tutorReminderLeadOption", { minutes })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
