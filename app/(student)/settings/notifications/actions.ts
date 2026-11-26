"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { saveEmailNotificationPreferences } from "@/lib/email-preferences/repository";
import { isTutorialEmailSchedule } from "@/lib/notifications/tutorial-email-schedule";
import { setActivityNotificationPreference, setTutorialEmailSchedule } from "@/lib/notifications/activity-preferences";
import type { ActivityNotificationPreferenceKey } from "@/lib/notifications/types";

export interface NotificationPreferencesActionState {
  success: boolean;
  message: string;
  submittedAt: number;
}

function readBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  if (value !== "true" && value !== "false") {
    throw new Error(`INVALID_NOTIFICATION_PREFERENCE:${key}`);
  }
  return value === "true";
}

export async function updateNotificationPreferencesAction(
  _previousState: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { success: false, message: "Your session expired. Sign in and try again.", submittedAt: Date.now() };
    }

    await saveEmailNotificationPreferences(session.user.id, {
      emailEnabled: readBoolean(formData, "emailEnabled"),
      courseUpdates: readBoolean(formData, "courseUpdates"),
      eventsAndSchedules: readBoolean(formData, "eventsAndSchedules"),
      learningReminders: readBoolean(formData, "learningReminders"),
      newsAndOffers: readBoolean(formData, "newsAndOffers"),
    });
    revalidatePath("/settings/notifications");
    revalidatePath("/settings");
    return { success: true, message: "Notification preferences saved.", submittedAt: Date.now() };
  } catch (error) {
    console.error("[updateNotificationPreferencesAction]", error);
    return { success: false, message: "Could not save notification preferences.", submittedAt: Date.now() };
  }
}

export async function updateActivityNotificationPreferenceAction(key: ActivityNotificationPreferenceKey, enabled: boolean): Promise<{ success: boolean }> {
  if ((key !== "discussionsEnabled" && key !== "flashcardsEnabled" && key !== "tutorAvailabilityEnabled" && key !== "tutorialSessionEmailEnabled") || typeof enabled !== "boolean") return { success: false };
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { success: false };
    await setActivityNotificationPreference(session.user.id, key, enabled);
    revalidatePath("/settings");
    revalidatePath("/settings/notifications");
    return { success: true };
  } catch (error) {
    console.error("[updateActivityNotificationPreferenceAction]", error);
    return { success: false };
  }
}

export async function updateTutorialEmailScheduleAction(schedule: unknown): Promise<{ success: boolean }> {
  if (!isTutorialEmailSchedule(schedule)) return { success: false };
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { success: false };
    await setTutorialEmailSchedule(session.user.id, schedule);
    revalidatePath("/settings");
    revalidatePath("/settings/notifications");
    return { success: true };
  } catch (error) {
    console.error("[updateTutorialEmailScheduleAction]", error);
    return { success: false };
  }
}
