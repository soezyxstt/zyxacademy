"use server";

/**
 * Server actions for the admin Tutorial PKA announcements screen.
 * Composes + sends a Google Meet review-session announcement (email + in-app
 * notification) to everyone enrolled in the Tutorial PKA campaign course.
 */

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, pkaAnnouncements, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { PKA_COURSE_ID, PKA_DISCLAIMER } from "@/lib/pka-config";
import { sendPkaAnnouncement } from "@/lib/notifications/send";

export interface PkaAnnouncementFormState {
  success?: boolean;
  error?: string;
  result?: {
    recipientCount: number;
    notificationsSucceeded: number;
    emailsSucceeded: number;
  };
}

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized - admin only");
  }
  return session.user;
}

function announcementEmailHtml(title: string, body: string, meetLink: string, sessionAt: Date) {
  const sessionLabel = sessionAt.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      <h1 style="font-family: 'Lexend', sans-serif; font-size: 22px; color: #0f172a; margin-top: 0; font-weight: 700;">${title}</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #475569; white-space: pre-line;">${body}</p>
      <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 15px; color: #334155;"><strong>Jadwal:</strong> ${sessionLabel}</p>
        <a href="${meetLink}" style="display: inline-block; margin-top: 8px; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Gabung Google Meet</a>
      </div>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
      <p style="font-size: 13px; color: #64748b; line-height: 1.4;">${PKA_DISCLAIMER}</p>
    </div>
  `;
}

export async function createAndSendPkaAnnouncementAction(
  _prevState: PkaAnnouncementFormState,
  formData: FormData,
): Promise<PkaAnnouncementFormState> {
  try {
    const admin = await requireAdmin();

    if (env.FEATURE_PKA !== "1") {
      return { error: "Fitur Tutorial PKA sedang tidak aktif." };
    }

    const title = formData.get("title")?.toString().trim() ?? "";
    const body = formData.get("body")?.toString().trim() ?? "";
    const meetLink = formData.get("meetLink")?.toString().trim() ?? "";
    const sessionAtRaw = formData.get("sessionAt")?.toString().trim() ?? "";

    if (!title || !body || !meetLink || !sessionAtRaw) {
      return { error: "Judul, pesan, link Meet, dan jadwal wajib diisi." };
    }

    const sessionAt = new Date(sessionAtRaw);
    if (Number.isNaN(sessionAt.getTime())) {
      return { error: "Jadwal sesi tidak valid." };
    }

    const announcementId = randomUUID();

    const enrolled = await db
      .select({ userId: enrollments.userId, email: user.email, name: user.name })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(eq(enrollments.courseId, PKA_COURSE_ID));

    await db.insert(pkaAnnouncements).values({
      id: announcementId,
      title,
      body,
      meetLink,
      sessionAt,
      createdBy: admin.id,
    });

    const notificationResult = await sendPkaAnnouncement(PKA_COURSE_ID, title, body, "/pka");

    const fromEmail = env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com";
    const emailHtml = announcementEmailHtml(title, body, meetLink, sessionAt);
    const emailResults = await Promise.allSettled(
      enrolled.map((student) =>
        resend.emails.send({
          from: `Zyx Academy <${fromEmail}>`,
          to: student.email,
          subject: `Sesi Review PKA - ${title}`,
          html: emailHtml,
        }),
      ),
    );
    const emailsSucceeded = emailResults.filter((r) => r.status === "fulfilled").length;
    for (const r of emailResults) {
      if (r.status === "rejected") console.error("[pka-announcement] email send failed:", r.reason);
    }

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
      },
    };
  } catch (err) {
    console.error("[createAndSendPkaAnnouncementAction]", err);
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}

export interface PkaAnnouncementHistoryRow {
  id: string;
  title: string;
  meetLink: string;
  sessionAt: Date;
  sentAt: Date | null;
  recipientCount: number | null;
  createdAt: Date;
}

export async function getPkaAnnouncementHistoryAction(): Promise<PkaAnnouncementHistoryRow[]> {
  await requireAdmin();

  return db
    .select({
      id: pkaAnnouncements.id,
      title: pkaAnnouncements.title,
      meetLink: pkaAnnouncements.meetLink,
      sessionAt: pkaAnnouncements.sessionAt,
      sentAt: pkaAnnouncements.sentAt,
      recipientCount: pkaAnnouncements.recipientCount,
      createdAt: pkaAnnouncements.createdAt,
    })
    .from(pkaAnnouncements)
    .orderBy(desc(pkaAnnouncements.createdAt));
}
