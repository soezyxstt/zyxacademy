import type { Locale } from "@/lib/i18n/locale";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { emailStyles, escapeEmailHtml as escape, renderEmailButton, renderEmailDetails, renderEmailLayout } from "./email-layout";
import { safeReminderLink } from "./tutorial-reminder-policy";

function localizedDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
}

function link(label: string, raw: string, base: string) {
  const href = safeReminderLink(raw, base);
  return href ? `<a href="${escape(href)}" style="${emailStyles.link}">${escape(label)}</a>` : "";
}

export function renderTutorAvailabilityEmail(input: { locale: Locale; name: string; start: string; end: string }) {
  const en = input.locale === "en";
  const subject = en ? "Add your tutorial availability" : "Isi jadwal ketersediaan tutorial";
  const range = `${localizedDate(input.start, input.locale)} – ${localizedDate(input.end, input.locale)}`;
  return { subject, html: renderEmailLayout({ locale: input.locale, bodyHtml: `
    <h1 style="${emailStyles.heading}">${escape(subject)}</h1>
    <p style="${emailStyles.paragraph}">${escape(en ? `Hello ${input.name},` : `Halo ${input.name},`)}</p>
    <p style="${emailStyles.paragraph}">${escape(en ? `You have not added a tutorial slot for ${range}. Add at least one slot so students can book a session with you.` : `Kamu belum mengisi slot tutorial untuk ${range}. Tambahkan minimal satu slot agar siswa bisa memesan sesi denganmu.`)}</p>
    ${renderEmailButton(en ? "Add availability" : "Isi ketersediaan", new URL("/tutor/schedule", getPublicAppUrl()).toString())}
  ` }) };
}

export interface TutorialReminderResource { label: string; url: string; fromTutor: boolean }
export function renderTutorialSessionReminderEmail(input: {
  locale: Locale; name: string; courseTitle: string; groupName: string; tutorName: string;
  date: string; startTime: string; endTime: string; mode: "online" | "offline";
  location: string | null; meetUrl: string | null; topic: string | null;
  audience: "student" | "tutor"; resources: TutorialReminderResource[]; minutesBefore: number;
}) {
  const en = input.locale === "en";
  const base = getPublicAppUrl();
  const subject = en ? `Tutorial reminder: ${input.courseTitle}` : `Pengingat tutorial: ${input.courseTitle}`;
  const hours = Math.floor(input.minutesBefore / 60);
  const minutes = input.minutesBefore % 60;
  const duration = [hours ? (en ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} jam`) : "",
    minutes ? (en ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${minutes} menit`) : ""].filter(Boolean).join(" ");
  const details = [
    { label: en ? "Course" : "Mata kuliah", value: input.courseTitle },
    { label: en ? "Group" : "Grup", value: input.groupName },
    { label: "Tutor", value: input.tutorName },
    { label: en ? "Date" : "Tanggal", value: localizedDate(input.date, input.locale) },
    { label: en ? "Time" : "Waktu", value: `${input.startTime} - ${input.endTime} WIB` },
    { label: en ? "Meeting type" : "Jenis pertemuan", value: input.mode === "online" ? (en ? "Online" : "Daring") : (en ? "In person" : "Tatap muka") },
    ...(input.mode === "offline" && input.location ? [{ label: en ? "Location" : "Lokasi", value: input.location }] : []),
    ...(input.topic ? [{ label: en ? "Topic" : "Topik", value: input.topic }] : []),
  ];
  const meetLink = input.mode === "online" && input.meetUrl ? safeReminderLink(input.meetUrl, base) : null;
  const meet = meetLink && new URL(meetLink).hostname === "meet.google.com" && new URL(meetLink).protocol === "https:"
    ? renderEmailButton(en ? "Join Google Meet" : "Gabung Google Meet", meetLink) : "";
  const resources = [true, false].map(fromTutor => {
    const links = input.resources.filter(r => r.fromTutor === fromTutor).map(r => link(r.label, r.url, base)).filter(Boolean);
    if (!links.length) return "";
    const title = fromTutor ? (en ? "Attachments from tutor" : "Lampiran dari tutor") : (en ? "Attachments from students" : "Lampiran dari siswa");
    return `<p style="${emailStyles.paragraph}font-weight:600;margin-top:20px;margin-bottom:8px;">${title}</p>
      <ul style="${emailStyles.paragraph}padding-left:22px;">${links.map(item => `<li>${item}</li>`).join("")}</ul>`;
  }).join("");
  const schedulePath = input.audience === "tutor" ? "/tutor/schedule" : "/dashboard/schedule";
  return { subject, html: renderEmailLayout({ locale: input.locale, bodyHtml: `
    <h1 style="${emailStyles.heading}">${escape(subject)}</h1>
    <p style="${emailStyles.paragraph}">${escape(en ? `Hello ${input.name},` : `Halo ${input.name},`)}</p>
    <p style="${emailStyles.paragraph}">${escape(en ? `Your tutorial starts in about ${duration}. Here are the meeting details.` : `Sesi tutorialmu akan dimulai sekitar ${duration} lagi. Berikut detail pertemuannya.`)}</p>
    ${renderEmailDetails(details)}
    ${meet}${resources}
    <p style="${emailStyles.paragraph}margin-top:20px;">${link(en ? "View tutorial schedule" : "Lihat jadwal tutorial", schedulePath, base)}</p>
  ` }) };
}
