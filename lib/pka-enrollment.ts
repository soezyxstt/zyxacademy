import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, pkaAnnouncements, pkaSchedules } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSemesterEndDate } from "@/lib/utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { sendToUser } from "@/lib/notifications/send";
import { pkaAnnouncementPayload, pkaSchedulePayload } from "@/lib/notifications/templates";
import { pkaAnnouncementEmailHtml, pkaAnnouncementEmailSubject, pkaScheduleEmailSubject, scheduleEmailHtml } from "@/lib/pka-email-template";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
import { sendOptionalEmail } from "@/lib/email-preferences/send";

/** True when the user already holds a Tutorial PKA enrollment row. */
export async function isPkaEnrolled(userId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, PKA_COURSE_ID)))
    .limit(1);
  return Boolean(existing);
}

/**
 * Idempotent enrollment into the Tutorial PKA course. Called from the
 * registration action once the intake form is submitted (no longer an
 * auto-enroll on page entry). When `notify` is false the catch-up emails and
 * push notifications are skipped, honouring the student's announcement opt-out.
 */
export async function ensurePkaEnrollment(userId: string, notify = true): Promise<void> {
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, PKA_COURSE_ID)))
    .limit(1);

  if (existing) return;

  const now = new Date();
  const enrollmentId = randomUUID();
  const expiresAt = getSemesterEndDate(now);
  await db.transaction(async (tx) => {
    await tx.insert(enrollments).values({
      id: enrollmentId,
      userId,
      courseId: PKA_COURSE_ID,
      enrolledAt: now,
      expiresAt,
    });
    await dualWriteEnrollment(tx, {
      id: enrollmentId,
      userId,
      courseId: PKA_COURSE_ID,
      enrolledAt: now,
      expiresAt,
    }, userId);
  });

  if (!notify) return;

  const futureSchedules = await db
    .select()
    .from(pkaSchedules)
    .where(gt(pkaSchedules.sessionAt, now));

  // Only announcements that were actually broadcast (sentAt set) in the last 7 days and not archived.
  const recentAnnouncements = await db
    .select()
    .from(pkaAnnouncements)
    .where(
      and(
        gt(pkaAnnouncements.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        isNotNull(pkaAnnouncements.sentAt),
        eq(pkaAnnouncements.isArchived, false),
      ),
    );

  if (futureSchedules.length === 0 && recentAnnouncements.length === 0) return;

  const sends: Promise<unknown>[] = [];

  for (const sched of futureSchedules) {
    sends.push(
      sendOptionalEmail({
        userId,
        category: "events_and_schedules",
        render: (locale) => ({
          subject: pkaScheduleEmailSubject(sched.title, locale),
          html: scheduleEmailHtml(sched.title, sched.sessionAt, sched.meetLink, locale),
        }),
      }),
      sendToUser(
        userId,
        pkaSchedulePayload(sched.title, sched.sessionAt, `/courses/${PKA_COURSE_ID}/jadwal`),
      ),
    );
  }

  for (const ann of recentAnnouncements) {
    sends.push(
      sendOptionalEmail({
        userId,
        category: "course_updates",
        render: (locale) => ({
          subject: pkaAnnouncementEmailSubject(ann.title, locale),
          html: pkaAnnouncementEmailHtml(ann.title, ann.body, locale),
        }),
      }),
      sendToUser(userId, pkaAnnouncementPayload(ann.title, ann.body, `/courses/${PKA_COURSE_ID}`)),
    );
  }

  // Await so serverless runtimes do not kill in-flight sends; failures only log.
  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[ensurePkaEnrollment] catch-up send failed:", r.reason);
    }
  }
}

/** Registration intake route; unenrolled students are sent here to fill the form. */
export const PKA_REGISTER_PATH = `/courses/${PKA_COURSE_ID}/daftar`;

/**
 * Requires a session on every `/courses/tutorial-pka/*` entry point (not just
 * the course home), since simulation/report links may be shared or deep-linked
 * directly. Redirects to sign-in with `next` pointing back at `currentPath`.
 * Enrollment is no longer automatic: students who have not completed the intake
 * form are redirected to it. Returns the authenticated user id.
 */
export async function requirePkaSession(currentPath: string): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(currentPath)}`);
  }
  if (!(await isPkaEnrolled(session.user.id))) {
    redirect(PKA_REGISTER_PATH);
  }
  return session.user.id;
}
