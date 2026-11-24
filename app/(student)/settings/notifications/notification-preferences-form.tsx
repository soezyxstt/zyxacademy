"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Bell, BookOpen, CalendarDays, Newspaper, ShieldCheck, BookmarkCheck } from "lucide-react";
import { updateNotificationPreferencesAction, type NotificationPreferencesActionState } from "./actions";
import type { EmailNotificationPreferences } from "@/lib/email-preferences/contracts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { DeviceNotificationSettings } from "@/components/notifications/device-notification-settings";
import { cn } from "@/lib/utils";

const INITIAL_ACTION_STATE: NotificationPreferencesActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

const CATEGORY_ROWS = [
  {
    key: "courseUpdates" as const,
    labelKey: "courseUpdates",
    descriptionKey: "courseUpdatesDescription",
    icon: BookOpen,
  },
  {
    key: "eventsAndSchedules" as const,
    labelKey: "schedule",
    descriptionKey: "scheduleDescription",
    icon: CalendarDays,
  },
  {
    key: "learningReminders" as const,
    labelKey: "studyReminders",
    descriptionKey: "studyRemindersDescription",
    icon: BookmarkCheck,
  },
  {
    key: "newsAndOffers" as const,
    labelKey: "programUpdates",
    descriptionKey: "programUpdatesDescription",
    icon: Newspaper,
  },
];

export function NotificationPreferencesForm({
  accountEmail,
  initialPreferences,
}: {
  accountEmail: string;
  initialPreferences: EmailNotificationPreferences;
}) {
  const t = useTranslations("student");
  const experience = useStudentExperience();
  const baseId = useId();
  const shownSubmission = useRef(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [state, formAction, pending] = useActionState(async (previous: NotificationPreferencesActionState, form: FormData) => {
    if (experience?.mode === "demo") return { success: true, message: "", submittedAt: Date.now() };
    return updateNotificationPreferencesAction(previous, form);
  }, INITIAL_ACTION_STATE);

  useEffect(() => {
    if (!state.submittedAt || shownSubmission.current === state.submittedAt) return;
    shownSubmission.current = state.submittedAt;
    if (state.success) toast.success(t("notificationPreferences.saved"));
    else toast.error(t("notificationPreferences.saveFailed"));
  }, [state, t]);

  const masterId = `${baseId}-email-enabled`;

  return (
    <div className="w-full space-y-6">
      <form action={formAction} className="w-full space-y-6">
      {Object.entries(preferences).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <section aria-labelledby="notification-preferences-heading">
        <header className="space-y-1 border-b border-border/40 pb-3">
          <h2
            id="notification-preferences-heading"
            className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t("notificationPreferences.title")}
          </h2>
          <p className="text-body-xs text-muted-foreground">
            {t("notificationPreferences.optionalDescription", { email: accountEmail })}
          </p>
        </header>

        <div className="divide-y divide-border/25">
          <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-(--row-padding) transition-colors hover:bg-muted/30">
            <label htmlFor={masterId} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-body-sm font-medium text-foreground">
                  {t("notificationPreferences.enableOptional")}
                </span>
                <span className="mt-0.5 block text-body-xs text-muted-foreground">
                  {t("notificationPreferences.categoriesPersist")}
                </span>
              </span>
            </label>
            <Switch
              id={masterId}
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => setPreferences((current) => ({ ...current, emailEnabled: checked === true }))}
              aria-label={t("notificationPreferences.enableOptional")}
            />
          </div>

          {CATEGORY_ROWS.map(({ key, labelKey, descriptionKey, icon: Icon }) => {
            const rowId = `${baseId}-${key}`;
            const disabled = !preferences.emailEnabled;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg px-3 py-(--row-padding) transition-colors",
                  !disabled && "hover:bg-muted/30"
                )}
              >
                <label
                  htmlFor={rowId}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-3",
                    disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-foreground">
                      {t(`notificationPreferences.${labelKey}`)}
                    </span>
                    <span className="mt-0.5 block text-body-xs text-muted-foreground">
                      {t(`notificationPreferences.${descriptionKey}`)}
                    </span>
                  </span>
                </label>
                <Switch
                  id={rowId}
                  checked={preferences[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked === true }))}
                  aria-label={t(`notificationPreferences.${labelKey}`)}
                />
              </div>
            );
          })}

          <div className="flex items-start gap-3 px-3 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-foreground">
                {t("notificationPreferences.importantEmailAlwaysOn")}
              </p>
              <p className="mt-0.5 text-body-xs text-muted-foreground">
                {t("notificationPreferences.securityDescription")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end border-t border-border/30 pt-4">
        <Button type="submit" size="sm" className="text-body-sm font-semibold" disabled={pending}>
          {pending ? t("notificationPreferences.saving") : t("notificationPreferences.save")}
        </Button>
      </div>
      </form>
      <div className="border-t border-border/40 pt-6">
        <DeviceNotificationSettings />
      </div>
    </div>
  );
}
