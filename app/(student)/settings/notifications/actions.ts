"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { saveEmailNotificationPreferences } from "@/lib/email-preferences/repository";

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
    if (env.FEATURE_NOTIFICATION_PREFERENCES !== "1") {
      return { success: false, message: "Notification preferences are not available.", submittedAt: Date.now() };
    }

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
    return { success: true, message: "Notification preferences saved.", submittedAt: Date.now() };
  } catch (error) {
    console.error("[updateNotificationPreferencesAction]", error);
    return { success: false, message: "Could not save notification preferences.", submittedAt: Date.now() };
  }
}
