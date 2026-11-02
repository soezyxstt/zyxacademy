/**
 * lib/notifications/templates.ts
 *
 * Pure functions that build notification payloads for each event type.
 * These are intentionally free of side-effects ; they just return data.
 * Importing this file is safe in any environment (server, client, edge).
 */

import type { NotificationPayload } from "./types";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../../messages/id/notifications.json" with { type: "json" };
import enMessages from "../../messages/en/notifications.json" with { type: "json" };

const messages = { id: idMessages, en: enMessages } as const;

function interpolate(template: string, values: Record<string, string>): string {
 return template.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? values[key] : match);
}

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
 systemTemplate: { key: "quiz_published", params: { quizTitle, courseTitle } },
 };
}

/** Render an app-owned notification string for one recipient's language. */
export function renderNotificationPayload(payload: NotificationPayload, locale: Locale): NotificationPayload {
 if (!payload.systemTemplate) return payload;
 if (payload.systemTemplate.key === "pka_schedule") {
  const { scheduleTitle, sessionAt } = payload.systemTemplate.params;
  const sessionLabel = new Date(sessionAt).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
   dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta",
  });
  const values = { scheduleTitle, sessionLabel };
  const body = interpolate(messages[locale].push.pkaSchedule.body, values);
  const title = interpolate(messages[locale].push.pkaSchedule.title, values);
  return { ...payload, title, body, metadata: { ...payload.metadata, locale } };
 }
 if (payload.systemTemplate.key === "pka_schedule_update") {
  const { scheduleTitle, sessionAt } = payload.systemTemplate.params;
  const sessionLabel = new Date(sessionAt).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
   dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta",
  });
  const values = { scheduleTitle, sessionLabel };
  const body = interpolate(messages[locale].push.pkaScheduleUpdate.body, values);
  const title = interpolate(messages[locale].push.pkaScheduleUpdate.title, values);
  return { ...payload, title, body, metadata: { ...payload.metadata, locale } };
 }
 if (payload.systemTemplate.key === "tutor_schedule_moved") {
  const template = messages[locale].push.tutorScheduleMoved;
  const body = interpolate(template.body, payload.systemTemplate.params);
  return { ...payload, title: template.title, body, metadata: { ...payload.metadata, locale } };
 }
 if (payload.systemTemplate.key === "tutor_ticket_decision") {
  const template = messages[locale].push.tutorTicketDecision;
  const typeLabel = payload.systemTemplate.params.ticketType === "reschedule"
   ? (locale === "id" ? "Reschedule" : "Reschedule")
   : (locale === "id" ? "Pembatalan" : "Cancellation");
  const decisionLabel = payload.systemTemplate.params.decision === "approved"
   ? (locale === "id" ? "Disetujui" : "approved")
   : (locale === "id" ? "Ditolak" : "declined");
  const title = interpolate(template.title, { ticketType: typeLabel, decision: decisionLabel });
  const body = payload.systemTemplate.params.notes ?? interpolate(template.body, { ticketType: typeLabel });
  return { ...payload, title, body, metadata: { ...payload.metadata, locale } };
 }
 if (payload.systemTemplate.key === "tutor_ticket_message") {
  return {
   ...payload,
   title: messages[locale].push.tutorTicketMessage.title,
   body: payload.systemTemplate.params.body,
   metadata: { ...payload.metadata, locale },
  };
 }
 const { quizTitle, courseTitle } = payload.systemTemplate.params;
 const text = messages[locale].push.quizPublished;
 return {
  ...payload,
  title: text.title,
  body: interpolate(text.body, { quizTitle, courseTitle }),
  metadata: { ...payload.metadata, locale },
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
 * @param link - Deep link (e.g. back to /courses/tutorial-pka).
 */
export function pkaAnnouncementPayload(
 title: string,
 body: string,
 link: string = "/courses/tutorial-pka"
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

/** New-schedule message with a localized system wrapper and authored schedule title. */
export function pkaSchedulePayload(title: string, sessionAt: Date, link: string): NotificationPayload {
 return {
  title,
  body: `Jadwal sesi tutorial PKA: ${title}.`,
  type: "announcement",
  link,
  metadata: { url: link },
  systemTemplate: { key: "pka_schedule", params: { scheduleTitle: title, sessionAt: sessionAt.toISOString() } },
 };
}

export function pkaScheduleUpdatePayload(title: string, sessionAt: Date, link: string): NotificationPayload {
 return {
  title: `Update Link Meet: ${title}`,
  body: `Link Meet telah ditambahkan untuk sesi ${title}.`,
  type: "announcement",
  link,
  metadata: { url: link },
  systemTemplate: { key: "pka_schedule_update", params: { scheduleTitle: title, sessionAt: sessionAt.toISOString() } },
 };
}

export function tutorScheduleMovedPayload(input: {
 dayOfWeek: string; sessionDate: string; startTime: string; endTime: string;
}): NotificationPayload {
 return {
  title: "Jadwal Tutorial Diperbarui",
  body: `Sesi dipindahkan ke ${input.dayOfWeek}, ${input.sessionDate} pukul ${input.startTime} - ${input.endTime}.`,
  type: "tutor_reminder",
  link: "/dashboard/schedule",
  metadata: { url: "/dashboard/schedule" },
  systemTemplate: { key: "tutor_schedule_moved", params: input },
 };
}

export function tutorTicketDecisionPayload(input: {
 ticketType: "reschedule" | "cancellation";
 decision: "approved" | "rejected";
 notes: string | null;
}): NotificationPayload {
 return {
  title: "Pembaruan tiket jadwal",
  body: input.notes ?? "Pengajar telah memutuskan tiket jadwal.",
  type: "tutor_reminder",
  link: "/dashboard/schedule",
  metadata: { url: "/dashboard/schedule" },
  systemTemplate: { key: "tutor_ticket_decision", params: input },
 };
}

export function tutorTicketMessagePayload(body: string): NotificationPayload {
 return {
  title: "Balasan baru pada diskusi jadwal",
  body,
  type: "tutor_reminder",
  link: "/dashboard/schedule",
  metadata: { url: "/dashboard/schedule" },
  systemTemplate: { key: "tutor_ticket_message", params: { body } },
 };
}
