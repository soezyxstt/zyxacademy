/**
 * lib/notifications/templates.ts
 *
 * Pure functions that build notification payloads for each event type.
 * These are intentionally free of side-effects ; they just return data.
 * Importing this file is safe in any environment (server, client, edge).
 */

import type { NotificationPayload } from "./types";

// ─── Quiz Published ───────────────────────────────────────────────────────────

/**
 * Notification sent to all students enrolled in a course when a quiz is published.
 *
 * @param quizTitle - Display title of the quiz template.
 * @param courseTitle - Name of the course (e.g. "Kalkulus IA").
 * @param quizUrl - Deep link to the quiz page (e.g. /courses/abc/quiz/xyz).
 */
export function quizPublishedPayload(
 quizTitle: string,
 courseTitle: string,
 quizUrl: string
): NotificationPayload {
 return {
 title: "📝 Kuis Baru Tersedia",
 body: `${quizTitle} untuk ${courseTitle} sudah bisa dikerjakan. Yuk coba sekarang!`,
 type: "quiz_published",
 link: quizUrl,
 metadata: {
 quizTitle,
 courseTitle,
 url: quizUrl,
 },
 };
}

// ─── Flashcard Daily Reminder ─────────────────────────────────────────────────

/**
 * Daily spaced-repetition reminder sent to students who have cards due today.
 *
 * @param dueCount - Number of flashcards due for review.
 * @param courseTitle - Name of the course the cards belong to.
 * @param reviewUrl - Deep link to the flashcard review page.
 */
export function flashcardReminderPayload(
 dueCount: number,
 courseTitle: string,
 reviewUrl: string
): NotificationPayload {
 const cardWord = dueCount === 1 ? "kartu" : "kartu";
 return {
 title: "🧠 Waktunya Review Flashcard!",
 body: `Kamu punya ${dueCount} ${cardWord} yang perlu diulang hari ini di ${courseTitle}.`,
 type: "flashcard_reminder",
 link: reviewUrl,
 metadata: {
 dueCount: String(dueCount),
 courseTitle,
 url: reviewUrl,
 },
 };
}

// ─── Tutor Session Reminder ───────────────────────────────────────────────────

/**
 * Reminder sent to a student before their booked tutor session.
 *
 * @param tutorName - Full name of the tutor.
 * @param sessionTime - Human-readable session time (e.g. "Senin, 14:00 - 15:30").
 * @param courseTitle - Course the session is for.
 * @param scheduleUrl - Deep link to the schedule page.
 */
export function tutorReminderPayload(
 tutorName: string,
 sessionTime: string,
 courseTitle: string,
 scheduleUrl: string = "/dashboard/schedule"
): NotificationPayload {
 return {
 title: "📅 Sesi Tutor Mendekat",
 body: `Sesi dengan ${tutorName} untuk ${courseTitle} dijadwalkan pada ${sessionTime}. Bersiaplah!`,
 type: "tutor_reminder",
 link: scheduleUrl,
 metadata: {
 tutorName,
 sessionTime,
 courseTitle,
 url: scheduleUrl,
 },
 };
}

// ─── Payment Success ──────────────────────────────────────────────────────────

/**
 * Confirmation notification sent after a successful payment / enrollment.
 *
 * @param planName - Subscription tier name (e.g. "Essential").
 * @param expiresAt - ISO date string of when the plan expires.
 */
export function paymentSuccessPayload(
 planName: string,
 expiresAt: string
): NotificationPayload {
 return {
 title: "✅ Pembayaran Berhasil",
 body: `Selamat! Paket ${planName} kamu aktif hingga ${expiresAt}. Selamat belajar!`,
 type: "payment_success",
 link: "/dashboard",
 metadata: {
 planName,
 expiresAt,
 url: "/dashboard",
 },
 };
}

// ─── Admin Broadcast ──────────────────────────────────────────────────────────

/**
 * Arbitrary broadcast notification composed by an admin.
 *
 * @param title - Notification title (admin-supplied).
 * @param body - Notification body text.
 * @param link - Optional deep link URL.
 */
export function adminBroadcastPayload(
 title: string,
 body: string,
 link: string = "/dashboard"
): NotificationPayload {
 return {
 title,
 body,
 type: "admin_broadcast",
 link,
 metadata: {
 url: link,
 },
 };
}

// ─── Tutorial PKA Announcement ────────────────────────────────────────────────

/**
 * Sent to all students enrolled in the Tutorial PKA campaign course when an
 * admin announces a Google Meet review session.
 *
 * @param title - Admin-supplied announcement title.
 * @param body - Admin-supplied announcement message.
 * @param link - Deep link (e.g. back to /pka).
 */
export function pkaAnnouncementPayload(
 title: string,
 body: string,
 link: string = "/pka"
): NotificationPayload {
 return {
 title,
 body,
 type: "announcement",
 link,
 metadata: {
 url: link,
 },
 };
}
