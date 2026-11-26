import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activityNotificationPreferences } from "@/db/schema";
import {
  DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES,
  type ActivityNotificationPreferences,
  type ActivityNotificationPreferenceKey,
} from "./types";

import { isTutorialEmailSchedule, type TutorialEmailSchedule } from "./tutorial-email-schedule";

export async function getActivityNotificationPreferences(userId: string): Promise<ActivityNotificationPreferences> {
  const [row] = await db.select({
    discussionsEnabled: activityNotificationPreferences.discussionsEnabled,
    flashcardsEnabled: activityNotificationPreferences.flashcardsEnabled,
    tutorAvailabilityEnabled: activityNotificationPreferences.tutorAvailabilityEnabled,
    tutorialSessionEmailEnabled: activityNotificationPreferences.tutorialSessionEmailEnabled,
    mode: activityNotificationPreferences.tutorialEmailMode,
    leadMinutes: activityNotificationPreferences.tutorialEmailLeadMinutes,
    intervalMinutes: activityNotificationPreferences.tutorialEmailIntervalMinutes,
  }).from(activityNotificationPreferences).where(eq(activityNotificationPreferences.userId, userId)).limit(1);
  if (!row) return { ...DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES };
  const { mode, leadMinutes, intervalMinutes, ...activity } = row;
  return { ...activity, tutorialEmailSchedule: { mode, leadMinutes, intervalMinutes } };
}

export async function setActivityNotificationPreference(userId: string, key: ActivityNotificationPreferenceKey, enabled: boolean) {
  const updatedAt = new Date();
  await db.insert(activityNotificationPreferences).values({ userId, [key]: enabled, updatedAt })
    .onConflictDoUpdate({ target: activityNotificationPreferences.userId, set: { [key]: enabled, updatedAt } });
}

export async function setTutorialEmailSchedule(userId: string, schedule: TutorialEmailSchedule) {
  if (!isTutorialEmailSchedule(schedule)) throw new Error("INVALID_TUTORIAL_EMAIL_SCHEDULE");
  const fields = {
    tutorialEmailMode: schedule.mode, tutorialEmailLeadMinutes: schedule.leadMinutes,
    tutorialEmailIntervalMinutes: schedule.intervalMinutes, updatedAt: new Date(),
  };
  await db.insert(activityNotificationPreferences).values({ userId, ...fields })
    .onConflictDoUpdate({ target: activityNotificationPreferences.userId, set: fields });
}
