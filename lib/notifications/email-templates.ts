/**
 * lib/notifications/email-templates.ts
 *
 * Pure bilingual HTML email renderers for Zyx Academy transactional and
 * optional notification emails (activation, schedule events, study
 * re-engagement, and upcoming session reminders).
 */

import type { Locale } from "@/lib/i18n/locale";
import { getPublicAppUrl } from "@/lib/public-app-url";

import { emailStyles, escapeEmailHtml as escapeHtml, renderEmailButton, renderEmailDetails, renderEmailLayout } from "./email-layout";

function resolveAppUrl(path: string): string {
  const base = getPublicAppUrl().replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

function wrapEmailLayout(
  locale: Locale,
  title: string,
  greeting: string,
  bodyHtml: string,
  cta?: { label: string; path: string },
): string {
  return renderEmailLayout({
    locale,
    bodyHtml: `<h1 style="${emailStyles.heading}">${escapeHtml(title)}</h1>
      <p style="${emailStyles.paragraph}">${escapeHtml(greeting)}</p>
      ${bodyHtml}
      ${cta ? renderEmailButton(cta.label, resolveAppUrl(cta.path)) : ""}`,
  });
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
      subject,
      heading,
      `<p style="${emailStyles.paragraph}">${paragraph}</p>`,
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
  const greeting = isEn ? `Hello ${input.recipientName},` : `Halo ${input.recipientName},`;
  const ctaLabel = isEn ? "Open schedule" : "Buka jadwal";

  return {
    subject: input.title,
    html: wrapEmailLayout(
      input.locale,
      input.title,
      greeting,
      `<p style="${emailStyles.paragraph}">${escapeHtml(input.summary)}</p>
       ${renderEmailDetails(input.details)}`,
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
      subject,
      heading,
      `<p style="${emailStyles.paragraph}">${intro}</p>
       <p style="${emailStyles.paragraph}">${recommendation}</p>`,
      { label: ctaLabel, path: input.link },
    ),
  };
}
