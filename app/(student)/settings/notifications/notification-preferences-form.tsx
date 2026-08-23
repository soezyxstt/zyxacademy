"use client";

import { useActionState, useEffect, useState } from "react";
import { Bell, BookOpen, CalendarDays, Mail, Newspaper, ShieldCheck, BookmarkCheck } from "lucide-react";
import { updateNotificationPreferencesAction, type NotificationPreferencesActionState } from "./actions";
import type { EmailNotificationPreferences } from "@/lib/email-preferences/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";

const INITIAL_ACTION_STATE: NotificationPreferencesActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

const CATEGORY_ROWS = [
  {
    key: "courseUpdates" as const,
    label: "Course updates",
    description: "Announcements, published materials, quizzes, and enrollment updates.",
    icon: BookOpen,
  },
  {
    key: "eventsAndSchedules" as const,
    label: "Events and schedules",
    description: "Live sessions, workshops, schedule changes, and meeting links.",
    icon: CalendarDays,
  },
  {
    key: "learningReminders" as const,
    label: "Learning reminders",
    description: "Weekly reflections, study reminders, and progress summaries.",
    icon: BookmarkCheck,
  },
  {
    key: "newsAndOffers" as const,
    label: "News and offers",
    description: "Product news, campaigns, and promotional offers.",
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
  const [preferences, setPreferences] = useState(initialPreferences);
  const [state, formAction, pending] = useActionState(updateNotificationPreferencesAction, INITIAL_ACTION_STATE);

  useEffect(() => {
    if (!state.submittedAt) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="w-full space-y-6">
      {Object.entries(preferences).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <Card className="w-full shadow-sm">
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-h5">Email notifications</CardTitle>
              <CardDescription className="mt-1">
                Optional email is sent to your Google account: <span className="font-medium text-foreground">{accountEmail}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <label className="flex cursor-pointer items-start gap-4 border-b border-border px-6 py-5">
            <Checkbox
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => setPreferences((current) => ({ ...current, emailEnabled: checked === true }))}
              className="mt-1 size-5"
              aria-label="Enable optional email notifications"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-body-base font-semibold text-foreground">
                <Bell className="size-4 text-primary" aria-hidden />
                Optional email notifications
              </span>
              <span className="mt-1 block text-body-sm text-muted-foreground">
                Turn off every optional email while keeping your category choices saved.
              </span>
            </span>
          </label>

          <div className="divide-y divide-border">
            {CATEGORY_ROWS.map(({ key, label, description, icon: Icon }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-4 px-6 py-5 has-[:disabled]:cursor-not-allowed"
              >
                <Checkbox
                  checked={preferences[key]}
                  disabled={!preferences.emailEnabled}
                  onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked === true }))}
                  className="mt-1 size-5"
                  aria-label={label}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-body-base font-semibold text-foreground">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {label}
                  </span>
                  <span className="mt-1 block text-body-sm text-muted-foreground">{description}</span>
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-status-info" aria-hidden />
        <div>
          <p className="text-body-sm font-semibold text-foreground">Essential email stays enabled</p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Security notices, payment receipts, enrollment confirmations, and account service messages are not optional.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="lg" isLoading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
