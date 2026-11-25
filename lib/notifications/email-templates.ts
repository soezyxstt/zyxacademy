/**
 * lib/notifications/email-templates.ts
 *
 * Pure bilingual HTML email renderers for Zyx Academy transactional and
 * optional notification emails (activation, schedule events, study
 * re-engagement, and upcoming session reminders).
 */

import type { Locale } from "@/lib/i18n/locale";
import { getPublicAppUrl } from "@/lib/public-app-url";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

function resolveAppUrl(path: string): string {
  const base = getPublicAppUrl().replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

function wrapEmailLayout(locale: Locale, heading: string, bodyHtml: string, cta?: { label: string; path: string }): string {
  const ctaHtml = cta
    ? `<p style="margin: 24px 0 0;"><a href="${escapeHtml(resolveAppUrl(cta.path))}" style="display: inline-block; padding: 10px 18px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Zyx Academy</title></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #0f172a;">
  <h1 style="font-size: 20px; margin: 0 0 12px;">${escapeHtml(heading)}</h1>
  ${bodyHtml}
  ${ctaHtml}
</body></html>`;
}

export function renderPaymentSuccessEmail(input: {
  locale: Locale;
  name: string;
  groupName: string;
  courseCount: number;
  link?: string;
}): { subject: string; html: string } {
  const isEn = input.locale === "en";
  const subject = isEn
    ? `Course access activated: ${input.groupName}`
    : `Akses belajar aktif: ${input.groupName}`;
  const heading = isEn ? `Hello ${input.name},` : `Halo ${input.name},`;
  const paragraph = isEn
    ? `Your group access for <strong>${escapeHtml(input.groupName)}</strong> is now active for <strong>${input.courseCount}</strong> course(s). You can start studying right away.`
    : `Akses belajar grup <strong>${escapeHtml(input.groupName)}</strong> kini aktif untuk <strong>${input.courseCount}</strong> mata kuliah. Kamu sudah bisa mulai belajar sekarang.`;
  const ctaLabel = isEn ? "Open dashboard" : "Buka dashboard";

  return {
    subject,
    html: wrapEmailLayout(
      input.locale,
      heading,
      `<p style="font-size: 15px; line-height: 1.6; color: #334155;">${paragraph}</p>`,
      { label: ctaLabel, path: input.link ?? "/dashboard" },
    ),
  };
}

export function renderScheduleEventEmail(input: {
  locale: Locale;
  recipientName: string;
  title: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
  link: string;
}): { subject: string; html: string } {
  const isEn = input.locale === "en";
  const listItems = input.details
    .map(
      (item) =>
        `<li style="margin: 4px 0;"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</li>`,
    )
    .join("");
  const greeting = isEn ? `Hello ${input.recipientName},` : `Halo ${input.recipientName},`;
  const ctaLabel = isEn ? "Open schedule" : "Buka jadwal";

  return {
    subject: input.title,
    html: wrapEmailLayout(
      input.locale,
      greeting,
      `<p style="font-size: 15px; line-height: 1.6; color: #334155;">${escapeHtml(input.summary)}</p>
       <ul style="margin: 16px 0; padding: 14px 18px; background: #f8fafc; border-radius: 8px; list-style: none; font-size: 14px; color: #0f172a;">${listItems}</ul>`,
      { label: ctaLabel, path: input.link },
    ),
  };
}

export function renderStudyReengagementEmail(input: {
  locale: Locale;
  name: string;
  inactiveDays: number;
  courseTitle: string;
  topicTitle?: string;
  link: string;
}): { subject: string; html: string } {
  const isEn = input.locale === "en";
  const subject = isEn
    ? `Continue studying ${input.courseTitle}`
    : `Lanjutkan belajar ${input.courseTitle}`;
  const heading = isEn ? `Hello ${input.name},` : `Halo ${input.name},`;
  const intro = isEn
    ? `It has been <strong>${input.inactiveDays} days</strong> since your last learning session on Zyx Academy.`
    : `Sudah <strong>${input.inactiveDays} hari</strong> sejak sesi belajar terakhirmu di Zyx Academy.`;
  const recommendation = input.topicTitle
    ? isEn
      ? `Suggested next step: continue <strong>${escapeHtml(input.topicTitle)}</strong> in <strong>${escapeHtml(input.courseTitle)}</strong>.`
      : `Langkah berikutnya yang disarankan: lanjutkan topik <strong>${escapeHtml(input.topicTitle)}</strong> di <strong>${escapeHtml(input.courseTitle)}</strong>.`
    : isEn
      ? `Suggested next step: review one short section in <strong>${escapeHtml(input.courseTitle)}</strong>.`
      : `Langkah berikutnya yang disarankan: tinjau satu bagian singkat di <strong>${escapeHtml(input.courseTitle)}</strong>.`;
  const ctaLabel = isEn ? "Continue learning" : "Lanjutkan belajar";

  return {
    subject,
    html: wrapEmailLayout(
      input.locale,
      heading,
      `<p style="font-size: 15px; line-height: 1.6; color: #334155;">${intro}</p>
       <p style="font-size: 15px; line-height: 1.6; color: #334155;">${recommendation}</p>`,
      { label: ctaLabel, path: input.link },
    ),
  };
}

export function renderUpcomingSessionEmail(input: {
  locale: Locale;
  recipientName: string;
  courseTitle: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  link: string;
}): { subject: string; html: string } {
  const isEn = input.locale === "en";
  return renderScheduleEventEmail({
    locale: input.locale,
    recipientName: input.recipientName,
    title: isEn
      ? `Upcoming tutorial session: ${input.courseTitle}`
      : `Pengingat sesi tutorial: ${input.courseTitle}`,
    summary: isEn
      ? `Reminder that your ${input.courseTitle} tutorial session is scheduled soon.`
      : `Pengingat bahwa sesi tutorial ${input.courseTitle} akan segera berlangsung.`,
    details: [
      { label: isEn ? "Course" : "Mata kuliah", value: input.courseTitle },
      { label: isEn ? "Date" : "Tanggal", value: input.sessionDate },
      { label: isEn ? "Time" : "Waktu", value: `${input.startTime} - ${input.endTime} WIB` },
    ],
    link: input.link,
  });
}
