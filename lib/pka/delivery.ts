import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, pkaRegistrations, user } from "@/db/schema";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import { sendToMany } from "@/lib/notifications/send";
import { pkaAnnouncementPayload, pkaSchedulePayload, pkaScheduleUpdatePayload } from "@/lib/notifications/templates";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import {
  pkaAnnouncementEmailHtml, pkaAnnouncementEmailSubject, pkaScheduleEmailSubject, pkaScheduleUpdateEmailSubject, scheduleEmailHtml,
} from "@/lib/pka-email-template";
import type { PkaDeliveryResult } from "@/packages/academic/pka-delivery";

export type PkaDelivery =
  | { kind: "announcement"; title: string; body: string }
  | { kind: "schedule-create" | "schedule-update"; title: string; sessionAt: Date; meetLink: string | null };

async function getPkaAudience() {
  const [enrolled, push] = await Promise.all([
    db.select({ userId: enrollments.userId }).from(enrollments).innerJoin(user, eq(user.id, enrollments.userId))
      .where(eq(enrollments.courseId, PKA_COURSE_ID)),
    db.select({ userId: enrollments.userId }).from(enrollments).innerJoin(user, eq(user.id, enrollments.userId))
      .leftJoin(pkaRegistrations, eq(pkaRegistrations.userId, enrollments.userId)).where(and(
        eq(enrollments.courseId, PKA_COURSE_ID),
        or(isNull(pkaRegistrations.id), eq(pkaRegistrations.receiveAnnouncements, true)),
      )),
  ]);
  return { enrolled, push };
}

export async function deliverPkaMessage(message: PkaDelivery): Promise<PkaDeliveryResult> {
  const { enrolled, push } = await getPkaAudience();
  const course = `/courses/${PKA_COURSE_ID}`;
  const schedule = `${course}/jadwal`;
  const announcement = message.kind === "announcement";
  const payload = announcement ? pkaAnnouncementPayload(message.title, message.body, course)
    : (message.kind === "schedule-create" ? pkaSchedulePayload : pkaScheduleUpdatePayload)(message.title, message.sessionAt, schedule);
  const notifications = await sendToMany(push.map(recipient => recipient.userId), payload);

  let emailsSucceeded = 0;
  let emailFailures = 0;
  const batchSize = 16;
  for (let offset = 0; offset < enrolled.length; offset += batchSize) {
    const outcomes = await Promise.allSettled(enrolled.slice(offset, offset + batchSize).map(recipient => sendOptionalEmail({
      userId: recipient.userId,
      category: announcement ? "course_updates" : "events_and_schedules",
      render: locale => announcement ? {
        subject: pkaAnnouncementEmailSubject(message.title, locale), html: pkaAnnouncementEmailHtml(message.title, message.body, locale),
      } : {
        subject: (message.kind === "schedule-create" ? pkaScheduleEmailSubject : pkaScheduleUpdateEmailSubject)(message.title, locale),
        html: scheduleEmailHtml(message.title, message.sessionAt, message.meetLink, locale),
      },
    })));
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") emailFailures += 1;
      else if (outcome.value.status === "sent") emailsSucceeded += 1;
    }
  }
  return {
    recipientCount: enrolled.length,
    notificationsSucceeded: notifications.succeeded,
    emailsSucceeded,
    failedCount: notifications.failedTokens.length + notifications.errors.length + emailFailures,
  };
}
