import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activityNotificationPreferences } from "@/db/schema";
import {
  DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES,
  type ActivityNotificationPreferences,
  type ActivityNotificationPreferenceKey,
} from "./types";

export async function getActivityNotificationPreferences(userId: string): Promise<ActivityNotificationPreferences> {
  const [row] = await db.select({
    discussionsEnabled: activityNotificationPreferences.discussionsEnabled,
    flashcardsEnabled: activityNotificationPreferences.flashcardsEnabled,
  }).from(activityNotificationPreferences).where(eq(activityNotificationPreferences.userId, userId)).limit(1);
  return row ?? { ...DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES };
}

export async function setActivityNotificationPreference(userId: string, key: ActivityNotificationPreferenceKey, enabled: boolean) {
  const updatedAt = new Date();
  await db.insert(activityNotificationPreferences).values({ userId, [key]: enabled, updatedAt })
    .onConflictDoUpdate({ target: activityNotificationPreferences.userId, set: { [key]: enabled, updatedAt } });
}
