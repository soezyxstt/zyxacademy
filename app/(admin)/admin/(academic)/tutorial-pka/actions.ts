"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, pkaAnnouncements, pkaRegistrations, pkaSchedules, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { storage } from "@/lib/storage";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { sendToMany } from "@/lib/notifications/send";
import { pkaAnnouncementPayload } from "@/lib/notifications/templates";
import { pkaAnnouncementEmailHtml, scheduleEmailHtml } from "@/lib/pka-email-template";

export interface PkaActionState {
  success?: boolean;
  error?: string;
  result?: {
    recipientCount: number;
    notificationsSucceeded: number;
    emailsSucceeded: number;
    broadcasted: boolean;
  };
}

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized - admin only");
  }
  return session.user;
}

function requirePkaFeature(): string | null {
  if (env.FEATURE_PKA !== "1") {
    return "Fitur Tutorial PKA sedang tidak aktif.";
  }
  return null;
}

/**
 * Broadcast recipients for announcements and schedules. Students who opted out
 * of announcements on the intake form (receiveAnnouncements = false) are
 * excluded; legacy enrollments without a registration row default to included.
 */
async function getEnrolledStudents() {
  return db
    .select({ userId: enrollments.userId, email: user.email })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .leftJoin(pkaRegistrations, eq(pkaRegistrations.userId, enrollments.userId))
    .where(
      and(
        eq(enrollments.courseId, PKA_COURSE_ID),
        or(isNull(pkaRegistrations.id), eq(pkaRegistrations.receiveAnnouncements, true)),
      ),
    );
}

const FROM_EMAIL = () => env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com";

// ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────────

export async function createAndSendPkaAnnouncementAction(
  _prevState: PkaActionState,
  formData: FormData,
): Promise<PkaActionState> {
  try {
    const admin = await requireAdmin();

    const featureError = requirePkaFeature();
    if (featureError) return { error: featureError };

    const title = formData.get("title")?.toString().trim() ?? "";
    const body = formData.get("body")?.toString().trim() ?? "";

    if (!title || !body) {
      return { error: "Judul dan pesan wajib diisi." };
    }

    const announcementId = randomUUID();
    const enrolled = await getEnrolledStudents();

    await db.insert(pkaAnnouncements).values({
      id: announcementId,
      title,
      body,
      createdBy: admin.id,
    });

    const notificationResult = await sendToMany(
      enrolled.map((e) => e.userId),
      pkaAnnouncementPayload(title, body, `/courses/${PKA_COURSE_ID}`),
    );

    const emailHtml = pkaAnnouncementEmailHtml(title, body);
    const emailResults = await Promise.allSettled(
      enrolled.map((student) =>
        resend.emails.send({
          from: `Zyx Academy <${FROM_EMAIL()}>`,
          to: student.email,
          subject: `Pengumuman PKA - ${title}`,
          html: emailHtml,
        }),
      ),
    );
    const emailsSucceeded = emailResults.filter((r) => r.status === "fulfilled").length;

    await db
      .update(pkaAnnouncements)
      .set({ sentAt: new Date(), recipientCount: enrolled.length })
      .where(eq(pkaAnnouncements.id, announcementId));

    return {
      success: true,
      result: {
        recipientCount: enrolled.length,
        notificationsSucceeded: notificationResult.succeeded,
        emailsSucceeded,
        broadcasted: true,
      },
    };
  } catch (err) {
    console.error("[createAndSendPkaAnnouncementAction]", err);
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}

export interface PkaAnnouncementRow {
  id: string;
  title: string;
  body: string;
  sentAt: Date | null;
  recipientCount: number | null;
  createdAt: Date;
}

export async function getPkaAnnouncementsAction(): Promise<PkaAnnouncementRow[]> {
  await requireAdmin();

  return db
    .select({
      id: pkaAnnouncements.id,
      title: pkaAnnouncements.title,
      body: pkaAnnouncements.body,
      sentAt: pkaAnnouncements.sentAt,
      recipientCount: pkaAnnouncements.recipientCount,
      createdAt: pkaAnnouncements.createdAt,
    })
    .from(pkaAnnouncements)
    .orderBy(desc(pkaAnnouncements.createdAt));
}

// ─── SCHEDULES ──────────────────────────────────────────────────────────────

/**
 * `sessionAt` must arrive as a full ISO string (with timezone) produced on the
 * client; parsing a bare `datetime-local` value here would use the server's
 * timezone and shift the stored session time in production.
 */
function parseScheduleForm(formData: FormData): { title: string; meetLink: string | null; sessionAt: Date } | { error: string } {
  const title = formData.get("title")?.toString().trim() ?? "";
  const meetLink = formData.get("meetLink")?.toString().trim() || null;
  const sessionAtRaw = formData.get("sessionAt")?.toString().trim() ?? "";

  if (!title || !sessionAtRaw) {
    return { error: "Judul dan jadwal wajib diisi." };
  }

  const sessionAt = new Date(sessionAtRaw);
  if (Number.isNaN(sessionAt.getTime())) {
    return { error: "Jadwal sesi tidak valid." };
  }

  if (meetLink && !/^https:\/\//.test(meetLink)) {
    return { error: "Link Meet harus diawali https://." };
  }

  return { title, meetLink, sessionAt };
}

export async function createPkaScheduleAction(
  _prevState: PkaActionState,
  formData: FormData,
): Promise<PkaActionState> {
  try {
    const admin = await requireAdmin();

    const featureError = requirePkaFeature();
    if (featureError) return { error: featureError };

    const parsed = parseScheduleForm(formData);
    if ("error" in parsed) return { error: parsed.error };
    const { title, meetLink, sessionAt } = parsed;

    const scheduleId = randomUUID();
    await db.insert(pkaSchedules).values({
      id: scheduleId,
      title,
      meetLink,
      sessionAt,
      createdBy: admin.id,
    });

    // Broadcast only for upcoming sessions; backfilling a past session stays silent.
    const isUpcoming = sessionAt.getTime() > Date.now();
    if (!isUpcoming) {
      return {
        success: true,
        result: { recipientCount: 0, notificationsSucceeded: 0, emailsSucceeded: 0, broadcasted: false },
      };
    }

    const enrolled = await getEnrolledStudents();
    const sessionLabel = sessionAt.toLocaleString("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });

    const notificationResult = await sendToMany(
      enrolled.map((e) => e.userId),
      pkaAnnouncementPayload(
        `Sesi baru: ${title}`,
        `${sessionLabel} WIB. Cek tab Jadwal untuk detail dan link Meet.`,
        `/courses/${PKA_COURSE_ID}/jadwal`,
      ),
    );

    const emailHtml = scheduleEmailHtml(title, sessionAt, meetLink);
    const emailResults = await Promise.allSettled(
      enrolled.map((student) =>
        resend.emails.send({
          from: `Zyx Academy <${FROM_EMAIL()}>`,
          to: student.email,
          subject: `Sesi Review PKA - ${title}`,
          html: emailHtml,
        }),
      ),
    );
    const emailsSucceeded = emailResults.filter((r) => r.status === "fulfilled").length;

    await db
      .update(pkaSchedules)
      .set({ sentAt: new Date(), recipientCount: enrolled.length })
      .where(eq(pkaSchedules.id, scheduleId));

    return {
      success: true,
      result: {
        recipientCount: enrolled.length,
        notificationsSucceeded: notificationResult.succeeded,
        emailsSucceeded,
        broadcasted: true,
      },
    };
  } catch (err) {
    console.error("[createPkaScheduleAction]", err);
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}

export async function updatePkaScheduleAction(
  scheduleId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    const featureError = requirePkaFeature();
    if (featureError) return { success: false, error: featureError };

    const parsed = parseScheduleForm(formData);
    if ("error" in parsed) return { success: false, error: parsed.error };
    const { title, meetLink, sessionAt } = parsed;

    const [existing] = await db.select().from(pkaSchedules).where(eq(pkaSchedules.id, scheduleId));
    if (!existing) return { success: false, error: "Jadwal tidak ditemukan." };

    await db
      .update(pkaSchedules)
      .set({ title, meetLink, sessionAt })
      .where(eq(pkaSchedules.id, scheduleId));

    if (meetLink && existing.meetLink !== meetLink && sessionAt.getTime() > Date.now()) {
      const enrolled = await getEnrolledStudents();
      const sessionLabel = sessionAt.toLocaleString("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      });

      await sendToMany(
        enrolled.map((e) => e.userId),
        pkaAnnouncementPayload(
          `Update Link Meet: ${title}`,
          `Link Meet telah ditambahkan untuk sesi ${sessionLabel}.`,
          `/courses/${PKA_COURSE_ID}/jadwal`,
        ),
      );

      const emailHtml = scheduleEmailHtml(title, sessionAt, meetLink);
      await Promise.allSettled(
        enrolled.map((student) =>
          resend.emails.send({
            from: `Zyx Academy <${FROM_EMAIL()}>`,
            to: student.email,
            subject: `Update Link Meet PKA - ${title}`,
            html: emailHtml,
          }),
        ),
      );
    }

    return { success: true };
  } catch (err) {
    console.error("[updatePkaScheduleAction]", err);
    return { success: false, error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}

export async function deletePkaScheduleAction(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    await db.delete(pkaSchedules).where(eq(pkaSchedules.id, scheduleId));
    return { success: true };
  } catch (err) {
    console.error("[deletePkaScheduleAction]", err);
    return { success: false, error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}

export interface PkaScheduleRow {
  id: string;
  title: string;
  meetLink: string | null;
  sessionAt: Date;
  sentAt: Date | null;
  recipientCount: number | null;
  createdAt: Date;
}

export async function getPkaSchedulesAction(): Promise<PkaScheduleRow[]> {
  await requireAdmin();

  return db
    .select({
      id: pkaSchedules.id,
      title: pkaSchedules.title,
      meetLink: pkaSchedules.meetLink,
      sessionAt: pkaSchedules.sessionAt,
      sentAt: pkaSchedules.sentAt,
      recipientCount: pkaSchedules.recipientCount,
      createdAt: pkaSchedules.createdAt,
    })
    .from(pkaSchedules)
    .orderBy(desc(pkaSchedules.sessionAt));
}

// ─── REGISTRATIONS ──────────────────────────────────────────────────────────

export interface PkaRegistrationRow {
  id: string;
  fullName: string;
  faculty: string;
  email: string;
  instagramUsername: string;
  proofUrl: string;
  receiveAnnouncements: boolean;
  accountName: string | null;
  accountEmail: string | null;
  createdAt: Date;
}

export async function getPkaRegistrationsAction(): Promise<PkaRegistrationRow[]> {
  await requireAdmin();

  const rows = await db
    .select({
      id: pkaRegistrations.id,
      fullName: pkaRegistrations.fullName,
      faculty: pkaRegistrations.faculty,
      email: pkaRegistrations.email,
      instagramUsername: pkaRegistrations.instagramUsername,
      proofKey: pkaRegistrations.proofKey,
      receiveAnnouncements: pkaRegistrations.receiveAnnouncements,
      accountName: user.name,
      accountEmail: user.email,
      createdAt: pkaRegistrations.createdAt,
    })
    .from(pkaRegistrations)
    .leftJoin(user, eq(user.id, pkaRegistrations.userId))
    .orderBy(desc(pkaRegistrations.createdAt));

  return rows.map(({ proofKey, ...r }) => ({
    ...r,
    proofUrl: storage.getUrl(proofKey),
  }));
}
