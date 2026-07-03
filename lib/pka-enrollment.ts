import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, pkaAnnouncements, pkaSchedules, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { getSemesterEndDate } from "@/lib/utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { sendToUser } from "@/lib/notifications/send";
import { pkaAnnouncementPayload } from "@/lib/notifications/templates";
import { pkaAnnouncementEmailHtml, scheduleEmailHtml } from "@/lib/pka-email-template";

/** Idempotent auto-enroll into the Tutorial PKA course. */
export async function ensurePkaEnrollment(userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, PKA_COURSE_ID)))
    .limit(1);

  if (existing) return;

  const now = new Date();
  await db.insert(enrollments).values({
    id: randomUUID(),
    userId,
    courseId: PKA_COURSE_ID,
    enrolledAt: now,
    expiresAt: getSemesterEndDate(now),
  });

  const futureSchedules = await db
    .select()
    .from(pkaSchedules)
    .where(gt(pkaSchedules.sessionAt, now));

  // Only announcements that were actually broadcast (sentAt set) in the last 7 days.
  const recentAnnouncements = await db
    .select()
    .from(pkaAnnouncements)
    .where(
      and(
        gt(pkaAnnouncements.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        isNotNull(pkaAnnouncements.sentAt),
      ),
    );

  if (futureSchedules.length === 0 && recentAnnouncements.length === 0) return;

  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (!u?.email) return;

  const fromEmail = env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com";
  const sends: Promise<unknown>[] = [];

  for (const sched of futureSchedules) {
    sends.push(
      resend.emails.send({
        from: `Zyx Academy <${fromEmail}>`,
        to: u.email,
        subject: `Sesi Review PKA - ${sched.title}`,
        html: scheduleEmailHtml(sched.title, sched.sessionAt, sched.meetLink),
      }),
      sendToUser(
        userId,
        pkaAnnouncementPayload(sched.title, "Jadwal sesi tutorial PKA.", `/courses/${PKA_COURSE_ID}/jadwal`),
      ),
    );
  }

  for (const ann of recentAnnouncements) {
    sends.push(
      resend.emails.send({
        from: `Zyx Academy <${fromEmail}>`,
        to: u.email,
        subject: `Pengumuman PKA - ${ann.title}`,
        html: pkaAnnouncementEmailHtml(ann.title, ann.body),
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

/**
 * Requires a session on every `/courses/tutorial-pka/*` entry point (not just
 * the course home), since simulation/report links may be shared or deep-linked
 * directly. Redirects to sign-in with `next` pointing back at `currentPath`,
 * then auto-enrolls. Returns the authenticated user id.
 */
export async function requirePkaSession(currentPath: string): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(currentPath)}`);
  }
  await ensurePkaEnrollment(session.user.id);
  return session.user.id;
}
