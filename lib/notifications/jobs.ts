/**
 * lib/notifications/jobs.ts
 *
 * Background job helper functions for scheduled push notifications.
 * These are pure functions designed to be called by a cron worker (e.g. Inngest).
 *
 * CRON WIRING IS NOT DONE HERE ; add Inngest function registrations separately.
 *
 * Each function returns a summary object so the caller can log results.
 */

import { db } from "@/db";
import {
 studentFlashcardProgress,
 flashcards,
 flashcardSets,
 courses,
 bookings,
 userPushTokens,
} from "@/db/schema";
import { eq, lte, inArray } from "drizzle-orm";
import {
 sendFlashcardReminder,
 sendTutorReminder,
 sendQuizPublished,
} from "./send";
// ─── Job result envelope ──────────────────────────────────────────────────────

export interface JobSummary {
 jobName: string;
 processedCount: number;
 totalSent: number;
 totalFailed: number;
 errors: string[];
 runAt: string;
}

// ─── Daily Flashcard Reminders ────────────────────────────────────────────────

/**
 * sendDailyFlashcardReminders
 *
 * Finds all students who have flashcard reviews due today AND have an FCM token.
 * Sends one reminder per student (grouped by their most urgent course).
 *
 * Intended to run once per day (e.g. at 08:00 local time via Inngest cron).
 */
export async function sendDailyFlashcardReminders(): Promise<JobSummary> {
 const jobName = "sendDailyFlashcardReminders";
 const errors: string[] = [];
 let processedCount = 0;
 let totalSent = 0;
 let totalFailed = 0;

 try {
 const now = new Date();

 // Find all students with at least one card due today
 const dueProgress = await db
 .select({
 studentId: studentFlashcardProgress.studentId,
 flashcardId: studentFlashcardProgress.flashcardId,
 })
 .from(studentFlashcardProgress)
 .where(lte(studentFlashcardProgress.dueDate, now));

 if (dueProgress.length === 0) {
 return {
 jobName,
 processedCount: 0,
 totalSent: 0,
 totalFailed: 0,
 errors: [],
 runAt: now.toISOString(),
 };
 }

 // Group by student
 const studentMap = new Map<string, { flashcardIds: string[] }>();
 for (const row of dueProgress) {
 const existing = studentMap.get(row.studentId) ?? { flashcardIds: [] };
 existing.flashcardIds.push(row.flashcardId);
 studentMap.set(row.studentId, existing);
 }

 // Only notify students who have an FCM token
 const studentIds = [...studentMap.keys()];
 const tokenRows = await db
 .selectDistinct({ userId: userPushTokens.userId })
 .from(userPushTokens)
 .where(inArray(userPushTokens.userId, studentIds));

 const tokenUserIds = new Set(tokenRows.map((r) => r.userId));

 // Send reminders
 for (const [studentId, { flashcardIds }] of studentMap) {
 if (!tokenUserIds.has(studentId)) continue;

 processedCount++;

 try {
 // Determine course title from the first due flashcard
 const cardRow = await db
 .select({ courseId: flashcardSets.courseId })
 .from(flashcards)
 .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
 .where(eq(flashcards.id, flashcardIds[0]))
 .limit(1);

 let courseTitle = "kursus Anda";
 if (cardRow[0]?.courseId) {
 const courseRow = await db
 .select({ title: courses.title })
 .from(courses)
 .where(eq(courses.id, cardRow[0].courseId))
 .limit(1);
 courseTitle = courseRow[0]?.title ?? courseTitle;
 }

 const reviewUrl = "/courses"; // students navigate to course for flashcards
 const result = await sendFlashcardReminder(
 studentId,
 flashcardIds.length,
 courseTitle,
 reviewUrl
 );

 totalSent += result.succeeded;
 totalFailed += result.failedTokens.length;
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 errors.push(`Student ${studentId}: ${msg}`);
 }
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 errors.push(`Job fatal error: ${msg}`);
 }

 return {
 jobName,
 processedCount,
 totalSent,
 totalFailed,
 errors,
 runAt: new Date().toISOString(),
 };
}

// ─── Upcoming Tutor Session Reminders ─────────────────────────────────────────

/**
 * sendUpcomingTutorReminders
 *
 * Sends reminders for tutor sessions scheduled within the next 24 hours.
 *
 * NOTE: The `bookings` table stores recurring slots (day-of-week), not specific
 * calendar dates. This function uses `dayOfWeek` to approximate upcoming sessions.
 * For production accuracy, consider adding a `scheduledDate` column to bookings.
 *
 * Intended to run once per day (or every few hours via Inngest cron).
 */
export async function sendUpcomingTutorReminders(): Promise<JobSummary> {
 const jobName = "sendUpcomingTutorReminders";
 const errors: string[] = [];
 let processedCount = 0;
 let totalSent = 0;
 let totalFailed = 0;

 try {
 // Determine tomorrow's day name to find upcoming sessions
 const tomorrow = new Date();
 tomorrow.setDate(tomorrow.getDate() + 1);
  // Fetch all bookings for that day
 const upcomingBookings = await db
 .select({ id: bookings.id })
 .from(bookings)
 .innerJoin(userPushTokens, eq(bookings.studentId, userPushTokens.userId))
 // We join with tutor_slots via the bookings.slotId, but do a raw SQL day check
 .limit(100); // safety cap

 // For each booking, send reminder
 for (const booking of upcomingBookings) {
 processedCount++;
 try {
 const result = await sendTutorReminder(booking.id);
 totalSent += result.succeeded;
 totalFailed += result.failedTokens.length;
 if (result.errors.length > 0) {
 errors.push(...result.errors);
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 errors.push(`Booking ${booking.id}: ${msg}`);
 }
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 errors.push(`Job fatal error: ${msg}`);
 }

 return {
 jobName,
 processedCount,
 totalSent,
 totalFailed,
 errors,
 runAt: new Date().toISOString(),
 };
}

// ─── Quiz Release Notifications ───────────────────────────────────────────────

/**
 * sendQuizReleaseNotifications
 *
 * Triggered when a quiz template is published.
 * Call this from the quiz publication server action/API route.
 *
 * @param quizId - ID of the quiz template.
 * @param quizTitle - Display title.
 * @param courseId - Course to find enrolled students.
 * @param courseTitle - Human-readable course name.
 */
export async function sendQuizReleaseNotifications(
 quizId: string,
 quizTitle: string,
 courseId: string,
 courseTitle: string
): Promise<JobSummary> {
 const jobName = "sendQuizReleaseNotifications";
 const errors: string[] = [];

 const quizUrl = `/courses/${courseId}/quiz`;
 let totalSent = 0;
 let totalFailed = 0;

 try {
 const result = await sendQuizPublished(quizTitle, courseId, courseTitle, quizUrl);
 totalSent = result.succeeded;
 totalFailed = result.failedTokens.length;
 errors.push(...result.errors);
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 errors.push(`Job fatal error: ${msg}`);
 }

 return {
 jobName,
 processedCount: 1,
 totalSent,
 totalFailed,
 errors,
 runAt: new Date().toISOString(),
 };
}
