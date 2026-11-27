"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Bell, BookOpen, CalendarDays, Newspaper, ShieldCheck, BookmarkCheck, MessagesSquare, Layers } from "lucide-react";
import { updateNotificationPreferencesAction, updateActivityNotificationPreferenceAction, updateTutorialEmailScheduleAction, type NotificationPreferencesActionState } from "./actions";
import { DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES, type ActivityNotificationPreferences, type ActivityNotificationPreferenceKey } from "@/lib/notifications/types";
import type { EmailNotificationPreferences } from "@/lib/email-preferences/contracts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { isTutorialEmailSchedule, tutorialEmailOffsets, type TutorialEmailMode } from "@/lib/notifications/tutorial-email-schedule";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { DeviceNotificationSettings } from "@/components/notifications/device-notification-settings";
import { QuietHoursSettings } from "@/components/settings/quiet-hours-settings";
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
  initialActivityPreferences = DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES,
  isTutor = false,
}: {
  accountEmail: string;
  initialPreferences: EmailNotificationPreferences;
  initialActivityPreferences?: ActivityNotificationPreferences;
  isTutor?: boolean;
}) {
  const t = useTranslations("student");
  const experience = useStudentExperience();
  const baseId = useId();
  const shownSubmission = useRef(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [activity, setActivity] = useState(initialActivityPreferences);
  const [activityPending, setActivityPending] = useState(false);
  const activityLock = useRef(false);
  useEffect(() => { setActivity(initialActivityPreferences); }, [initialActivityPreferences]);
  const toggleActivity = async (key: ActivityNotificationPreferenceKey, enabled: boolean) => {
    if (activityLock.current) return;
    activityLock.current = true;
    setActivityPending(true);
    const previous = activity[key];
    setActivity(current => ({ ...current, [key]: enabled }));
    try {
      const result = experience?.mode === "demo" ? { success: true } : await updateActivityNotificationPreferenceAction(key, enabled);
      if (!result.success) throw new Error("SAVE_FAILED");
      toast.success(t("notificationPreferences.saved"));
    } catch {
      setActivity(current => ({ ...current, [key]: previous }));
      toast.error(t("notificationPreferences.saveFailed"));
    } finally {
      activityLock.current = false;
      setActivityPending(false);
    }
  };
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

  const initialSchedule = initialActivityPreferences.tutorialEmailSchedule;
  const [emailMode, setEmailMode] = useState<TutorialEmailMode>(initialSchedule.mode);
  const [leadHours, setLeadHours] = useState(String(Math.floor(initialSchedule.leadMinutes / 60)));
  const [leadMinutes, setLeadMinutes] = useState(String(initialSchedule.leadMinutes % 60));
  const [interval, setInterval] = useState(String(initialSchedule.intervalMinutes));
  useEffect(() => {
    setEmailMode(initialSchedule.mode);
    setLeadHours(String(Math.floor(initialSchedule.leadMinutes / 60)));
    setLeadMinutes(String(initialSchedule.leadMinutes % 60));
    setInterval(String(initialSchedule.intervalMinutes));
  }, [initialSchedule.mode, initialSchedule.leadMinutes, initialSchedule.intervalMinutes]);
  const schedule = { mode: emailMode, leadMinutes: Number(leadHours) * 60 + Number(leadMinutes),
    intervalMinutes: emailMode === "repeat" ? Number(interval) : activity.tutorialEmailSchedule.intervalMinutes };
  const validSchedule = leadHours !== "" && leadMinutes !== "" && (emailMode === "once" || interval !== "") &&
    Number.isInteger(Number(leadHours)) && Number(leadHours) >= 0 && Number(leadHours) <= 24 &&
    Number.isInteger(Number(leadMinutes)) && Number(leadMinutes) >= 0 && Number(leadMinutes) <= 59 &&
    isTutorialEmailSchedule(schedule);
  const scheduleChanged = schedule.mode !== activity.tutorialEmailSchedule.mode ||
    schedule.leadMinutes !== activity.tutorialEmailSchedule.leadMinutes ||
    schedule.intervalMinutes !== activity.tutorialEmailSchedule.intervalMinutes;
  const saveSchedule = async () => {
    if (!validSchedule || activityLock.current) return;
    activityLock.current = true;
    setActivityPending(true);
    try {
      const result = experience?.mode === "demo" ? { success: true } : await updateTutorialEmailScheduleAction(schedule);
      if (!result.success) throw new Error("SAVE_FAILED");
      setActivity(current => ({ ...current, tutorialEmailSchedule: schedule }));
      toast.success(t("notificationPreferences.saved"));
    } catch {
      toast.error(t("notificationPreferences.saveFailed"));
    } finally {
      activityLock.current = false;
      setActivityPending(false);
    }
  };

  const masterId = `${baseId}-email-enabled`;

  return (
    <div className="w-full space-y-6">
      <section aria-labelledby={`${baseId}-activity-heading`}>
        <header className="space-y-1 border-b border-border/40 pb-3">
          <h2 id={`${baseId}-activity-heading`} className="font-heading text-body-base font-bold text-foreground">{t("notificationPreferences.activitySectionTitle")}</h2>
          <p className="text-body-xs text-muted-foreground">{t("notificationPreferences.activitySectionDescription")}</p>
        </header>
        <div className="divide-y divide-border/25">
          {([
            { key: "discussionsEnabled", label: "activityDiscussions", description: "activityDiscussionsDescription", Icon: MessagesSquare },
            { key: "flashcardsEnabled", label: "activityFlashcards", description: "activityFlashcardsDescription", Icon: Layers },
            { key: "tutorAvailabilityEnabled", label: "activityTutorAvailability", description: "activityTutorAvailabilityDescription", Icon: CalendarDays },
            { key: "tutorialSessionEmailEnabled", label: "activityTutorialSessionEmail", description: "activityTutorialSessionEmailDescription", Icon: CalendarDays },
          ] as const).filter(row => row.key !== "tutorAvailabilityEnabled" || isTutor).map(({ key, label, description, Icon }) => (
            <div key={key} className="flex items-center justify-between gap-4 rounded-lg px-3 py-(--row-padding) transition-colors hover:bg-muted/30">
              <label htmlFor={`${baseId}-${key}`} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-foreground">{t(`notificationPreferences.${label}`)}</span>
                  <span className="mt-0.5 block text-body-xs text-muted-foreground">{t(`notificationPreferences.${description}`)}</span>
                </span>
              </label>
              <Switch id={`${baseId}-${key}`} checked={activity[key]} disabled={activityPending} onCheckedChange={checked => void toggleActivity(key, checked)} aria-label={t(`notificationPreferences.${label}`)} />
            </div>
          ))}
          {activity.tutorialSessionEmailEnabled && (
            <div className="space-y-3 px-3 py-3 sm:pl-10">
              <label htmlFor={`${baseId}-tutorial-email-mode`} className="block text-body-sm font-medium">
                {t("notificationPreferences.tutorialEmailFrequency")}
              </label>
              <select id={`${baseId}-tutorial-email-mode`} value={emailMode}
                onChange={event => setEmailMode(event.target.value === "repeat" ? "repeat" : "once")}
                disabled={activityPending}
                className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-body-sm focus-visible:ring-2 focus-visible:ring-primary/50">
                <option value="once">{t("notificationPreferences.tutorialEmailOnce")}</option>
                <option value="repeat">{t("notificationPreferences.tutorialEmailRepeat")}</option>
              </select>
              <fieldset disabled={activityPending} className="space-y-2">
                <legend className="mb-2 text-body-sm font-medium">
                  {t(emailMode === "repeat" ? "notificationPreferences.tutorialEmailFirst" : "notificationPreferences.tutorialEmailBefore")}
                </legend>
                <div className="grid max-w-sm grid-cols-2 gap-3">
                  <label className="space-y-1 text-body-xs">
                    <span>{t("notificationPreferences.tutorialEmailHours")}</span>
                    <Input type="number" min={0} max={24} step={1} value={leadHours} onChange={event => setLeadHours(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-body-xs">
                    <span>{t("notificationPreferences.tutorialEmailMinutes")}</span>
                    <Input type="number" min={0} max={59} step={1} value={leadMinutes} onChange={event => setLeadMinutes(event.target.value)} />
                  </label>
                </div>
                {emailMode === "repeat" && (
                  <label className="block max-w-sm space-y-1 text-body-xs">
                    <span>{t("notificationPreferences.tutorialEmailEvery")}</span>
                    <Input type="number" min={5} max={1440} step={1} value={interval} onChange={event => setInterval(event.target.value)} />
                  </label>
                )}
              </fieldset>
              <p className={cn("text-body-xs", validSchedule ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
                {validSchedule
                  ? t("notificationPreferences.tutorialEmailCount", { count: tutorialEmailOffsets(schedule).length })
                  : t("notificationPreferences.tutorialEmailInvalid")}
              </p>
              <p className="text-body-xs text-muted-foreground">{t("notificationPreferences.tutorialEmailCategoryNote")}</p>
              <Button type="button" size="sm" variant="outline" disabled={!validSchedule || !scheduleChanged || activityPending}
                onClick={() => void saveSchedule()}>{t("notificationPreferences.tutorialEmailSave")}</Button>
            </div>
          )}
        </div>
      </section>
      <DeviceNotificationSettings />
      <QuietHoursSettings />
      <form action={formAction} className="w-full space-y-6">
      {Object.entries(preferences).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <section aria-labelledby="notification-preferences-heading">
        <header className="space-y-1 border-b border-border/40 pb-3">
          <h2
            id="notification-preferences-heading"
            className="font-heading text-body-base font-bold text-foreground"
          >
            {t("notificationPreferences.emailSectionTitle")}
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
    </div>
  );
}
