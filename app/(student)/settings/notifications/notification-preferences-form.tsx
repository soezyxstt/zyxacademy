"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Bell, BookOpen, CalendarDays, Mail, Newspaper, ShieldCheck, BookmarkCheck } from "lucide-react";
import { updateNotificationPreferencesAction, type NotificationPreferencesActionState } from "./actions";
import type { EmailNotificationPreferences } from "@/lib/email-preferences/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";

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
  const shownSubmission = useRef(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [state, formAction, pending] = useActionState(updateNotificationPreferencesAction, INITIAL_ACTION_STATE);

  useEffect(() => {
    if (!state.submittedAt || shownSubmission.current === state.submittedAt) return;
    shownSubmission.current = state.submittedAt;
    if (state.success) toast.success(t("notificationPreferences.saved"));
    else toast.error(t("notificationPreferences.saveFailed"));
  }, [state, t]);

  return (
    <form action={formAction} className="w-full space-y-6">
      {Object.entries(preferences).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <Card className="w-full shadow-xs">
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="font-heading text-body-base font-bold">{t("notificationPreferences.title")}</CardTitle>
              <CardDescription className="mt-1 text-body-xs">
                {t("notificationPreferences.optionalDescription", { email: accountEmail })}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <label className="flex cursor-pointer items-start gap-4 border-b border-border px-4 py-3 hover:bg-muted/20 transition-colors">
            <Checkbox
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => setPreferences((current) => ({ ...current, emailEnabled: checked === true }))}
              className="mt-1 size-5 rounded-md"
              aria-label={t("notificationPreferences.enableOptional")}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                <Bell className="size-4 text-primary" aria-hidden />
                {t("notificationPreferences.enableOptional")}
              </span>
              <span className="mt-1 block text-body-xs text-muted-foreground">
                {t("notificationPreferences.categoriesPersist")}
              </span>
            </span>
          </label>

          <div className="divide-y divide-border">
            {CATEGORY_ROWS.map(({ key, labelKey, descriptionKey, icon: Icon }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-4 px-4 py-3 has-[:disabled]:cursor-not-allowed hover:bg-muted/20 transition-colors"
              >
                <Checkbox
                  checked={preferences[key]}
                  disabled={!preferences.emailEnabled}
                  onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked === true }))}
                  className="mt-1 size-5 rounded-md"
                  aria-label={t(`notificationPreferences.${labelKey}`)}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {t(`notificationPreferences.${labelKey}`)}
                  </span>
                  <span className="mt-0.5 block text-body-xs text-muted-foreground">{t(`notificationPreferences.${descriptionKey}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 px-1">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden />
        <div>
          <p className="text-body-sm font-semibold text-foreground">{t("notificationPreferences.importantEmailAlwaysOn")}</p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {t("notificationPreferences.securityDescription")}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="default" className="rounded-lg px-6 font-semibold" disabled={pending}>
          {pending ? t("notificationPreferences.saving") : t("notificationPreferences.save")}
        </Button>
      </div>
    </form>
  );
}
