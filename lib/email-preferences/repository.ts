import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailNotificationPreferences, pkaRegistrations } from "@/db/schema";
import {
  applyCategoryUnsubscribe,
  DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
  type EmailNotificationCategory,
  type EmailNotificationPreferences,
} from "./contracts";

function fromRow(row: typeof emailNotificationPreferences.$inferSelect): EmailNotificationPreferences {
  return {
    emailEnabled: row.emailEnabled,
    courseUpdates: row.courseUpdates,
    eventsAndSchedules: row.eventsAndSchedules,
    learningReminders: row.learningReminders,
    newsAndOffers: row.newsAndOffers,
  };
}

export async function getEmailNotificationPreferences(userId: string): Promise<EmailNotificationPreferences> {
  const [stored] = await db
    .select()
    .from(emailNotificationPreferences)
    .where(eq(emailNotificationPreferences.userId, userId))
    .limit(1);
  if (stored) return fromRow(stored);

  const [legacyPka] = await db
    .select({ receiveAnnouncements: pkaRegistrations.receiveAnnouncements })
    .from(pkaRegistrations)
    .where(eq(pkaRegistrations.userId, userId))
    .limit(1);
  if (legacyPka?.receiveAnnouncements === false) {
    return {
      ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
      courseUpdates: false,
      eventsAndSchedules: false,
    };
  }
  return { ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES };
}

export async function saveEmailNotificationPreferences(
  userId: string,
  preferences: EmailNotificationPreferences,
): Promise<EmailNotificationPreferences> {
  const now = new Date();
  await db
    .insert(emailNotificationPreferences)
    .values({ userId, ...preferences, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: emailNotificationPreferences.userId,
      set: { ...preferences, updatedAt: now },
    });
  return preferences;
}

export async function unsubscribeEmailCategory(
  userId: string,
  category: EmailNotificationCategory,
): Promise<EmailNotificationPreferences> {
  const current = await getEmailNotificationPreferences(userId);
  return saveEmailNotificationPreferences(userId, applyCategoryUnsubscribe(current, category));
}
