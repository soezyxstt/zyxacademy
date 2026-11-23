/**
 * jobs/notification-intervals.ts
 *
 * Interval-based (scheduled) notification jobs for Zyx Academy:
 * 1. studyReengagementCron: invites inactive students (3+ days) back to a
 *    specific course; adds optional email at 7+ inactive days.
 * 2. flashcardReminderCron: reminds students when 5+ SM-2 flashcards are due.
 * 3. upcomingSessionReminderCron: server-backed H-24h (push + optional email)
 *    and H-1h (push) reminders for confirmed tutorial sessions (students & tutors).
 * 4. tutorDailyDigestCron: morning summary for tutors with pending schedule
 *    tickets or ungraded student quiz attempts.
 */

import { defineJob } from "./define-job";
import { db } from "@/db";
import {
  bookings,
  bookingRescheduleTickets,
  courses,
  enrollments,
  groupMembers,
  kemajuanFlashcardMurid,
  learningEvents,
  notifications,
  quizTemplates,
  studentQuizAttempts,
  tutorCourses,
  tutorSlots,
  user,
} from "@/db/schema";
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { mapConcurrent } from "./vector-sync";
import { hasRecentNotificationByDedupeKey, sendToUser } from "@/lib/notifications/send";
import {
  flashcardReminderPayload,
  studyReengagementPayload,
  tutorDailyDigestPayload,
  upcomingSessionReminderPayload,
} from "@/lib/notifications/templates";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import {
  renderStudyReengagementEmail,
  renderUpcomingSessionEmail,
} from "@/lib/notifications/email-templates";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import {
  classifyReengagementTier,
  classifyUpcomingSessionWindow,
  formatJakartaDateKey,
  parseJakartaSessionStart,
} from "@/lib/notifications/interval-policy";

export {
  classifyReengagementTier,
  classifyUpcomingSessionWindow,
  formatJakartaDateKey,
  parseJakartaSessionStart,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── 1. Study Re-engagement Cron (Daily 11:00 UTC / 18:00 WIB) ───────────────

export const studyReengagementCron = defineJob(
  {
    id: "study-reengagement-cron",
    name: "Study Re-engagement Cron",
    triggers: [{ cron: "0 11 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const dateKey = formatJakartaDateKey(now);
    const threeDaysAgo = new Date(now.getTime() - 3 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const candidates = await step.run("find-inactive-students", async () => {
      const rows = await db
        .select({
          studentId: learningEvents.studentId,
          lastActiveAt: sql<Date>`max(${learningEvents.createdAt})`,
        })
        .from(learningEvents)
        .innerJoin(
          enrollments,
          and(
            eq(enrollments.userId, learningEvents.studentId),
            gt(enrollments.expiresAt, now),
          ),
        )
        .groupBy(learningEvents.studentId)
        .having(
          and(
            lte(sql`max(${learningEvents.createdAt})`, threeDaysAgo),
            gte(sql`max(${learningEvents.createdAt})`, thirtyDaysAgo),
          ),
        )
        .limit(500);

      return rows.map((row) => ({
        studentId: row.studentId,
        lastActiveIso: new Date(row.lastActiveAt).toISOString(),
      }));
    });

    const stats = await step.run("dispatch-reengagement-batch", async () => {
      let sentPush = 0;
      let sentEmail = 0;
      let skippedCooldown = 0;

      await mapConcurrent(candidates, 5, async (candidate) => {
        try {
          const lastActiveMs = new Date(candidate.lastActiveIso).getTime();
          const inactiveDays = Math.max(3, Math.floor((now.getTime() - lastActiveMs) / DAY_MS));
          const tier = classifyReengagementTier(inactiveDays);
          if (tier === "none") return;

          const cooldownDays = tier === "email_7d" ? 7 : 4;
          const cooldownSince = new Date(now.getTime() - cooldownDays * DAY_MS);
          const [recent] = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, candidate.studentId),
                eq(notifications.type, "study_reengagement"),
                gte(notifications.createdAt, cooldownSince),
              ),
            )
            .limit(1);

          if (recent) {
            skippedCooldown++;
            return;
          }

          // Pick the student's most recently touched active course for a contextual invitation
          const [lastCourse] = await db
            .select({
              courseId: courses.id,
              courseTitle: courses.title,
            })
            .from(learningEvents)
            .innerJoin(courses, eq(courses.id, learningEvents.courseId))
            .innerJoin(
              enrollments,
              and(
                eq(enrollments.userId, learningEvents.studentId),
                eq(enrollments.courseId, learningEvents.courseId),
                gt(enrollments.expiresAt, now),
              ),
            )
            .where(eq(learningEvents.studentId, candidate.studentId))
            .orderBy(desc(learningEvents.createdAt))
            .limit(1);

          const [fallbackEnrollment] = !lastCourse
            ? await db
                .select({
                  courseId: courses.id,
                  courseTitle: courses.title,
                })
                .from(enrollments)
                .innerJoin(courses, eq(courses.id, enrollments.courseId))
                .where(and(eq(enrollments.userId, candidate.studentId), gt(enrollments.expiresAt, now)))
                .limit(1)
            : [undefined];

          const targetCourse = lastCourse ?? fallbackEnrollment;
          if (!targetCourse) return;

          const link = `/courses/${targetCourse.courseId}`;
          const locale = (await getUserLocalePreference(candidate.studentId)) ?? DEFAULT_LOCALE;

          await sendToUser(
            candidate.studentId,
            studyReengagementPayload({
              inactiveDays,
              courseTitle: targetCourse.courseTitle,
              link,
              dedupeKey: `study_reengagement:${dateKey}:${tier}`,
            }),
            locale,
          );
          sentPush++;

          if (tier === "email_7d" && process.env.RESEND_API_KEY) {
            const [account] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, candidate.studentId))
              .limit(1);
            const emailResult = await sendOptionalEmail({
              userId: candidate.studentId,
              category: "learning_reminders",
              locale,
              render: (resolvedLocale) =>
                renderStudyReengagementEmail({
                  locale: resolvedLocale,
                  name: account?.name ?? "Zyx Learner",
                  inactiveDays,
                  courseTitle: targetCourse.courseTitle,
                  link,
                }),
            });
            if (emailResult.status === "sent") sentEmail++;
          }
        } catch (err) {
          console.error(`[study-reengagement-cron] Failed for student ${candidate.studentId}:`, err);
        }
      });

      return { sentPush, sentEmail, skippedCooldown };
    });

    return { candidates: candidates.length, ...stats };
  },
);

// ─── 2. Flashcard Due Reminder Cron (Daily 01:00 UTC / 08:00 WIB) ────────────

export const flashcardReminderCron = defineJob(
  {
    id: "flashcard-reminder-cron",
    name: "Flashcard Due Reminder Cron",
    triggers: [{ cron: "0 1 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const dateKey = formatJakartaDateKey(now);
    const dedupeKey = `flashcard_reminder:${dateKey}`;

    const dueByStudent = await step.run("query-due-flashcards", async () => {
      const rows = await db
        .select({
          userId: kemajuanFlashcardMurid.penggunaId,
          dueCount: sql<number>`count(*)::int`,
        })
        .from(kemajuanFlashcardMurid)
        .where(
          and(
            eq(kemajuanFlashcardMurid.status, "active"),
            lte(kemajuanFlashcardMurid.dueAt, now),
          ),
        )
        .groupBy(kemajuanFlashcardMurid.penggunaId)
        .having(sql`count(*) >= 5`)
        .limit(500);

      return rows.map((row) => ({
        userId: row.userId,
        dueCount: Number(row.dueCount),
      }));
    });

    const stats = await step.run("dispatch-flashcard-reminders", async () => {
      let sent = 0;
      let skipped = 0;

      await mapConcurrent(dueByStudent, 5, async (entry) => {
        try {
          const alreadySent = await hasRecentNotificationByDedupeKey({
            userId: entry.userId,
            type: "flashcard_reminder",
            dedupeKey,
          });
          if (alreadySent) {
            skipped++;
            return;
          }

          await sendToUser(
            entry.userId,
            flashcardReminderPayload({
              dueCount: entry.dueCount,
              link: "/courses",
              dedupeKey,
            }),
          );
          sent++;
        } catch (err) {
          console.error(`[flashcard-reminder-cron] Failed for student ${entry.userId}:`, err);
        }
      });

      return { sent, skipped };
    });

    return { eligible: dueByStudent.length, ...stats };
  },
);

// ─── 3. Upcoming Tutorial Session Reminder Cron (Hourly) ────

export const upcomingSessionReminderCron = defineJob(
  {
    id: "upcoming-session-reminder-cron",
    name: "Upcoming Tutorial Session Reminder Cron",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const hourlyTick = new Date(now);
    hourlyTick.setUTCMinutes(0, 0, 0);
    const todayKey = formatJakartaDateKey(now);
    const tomorrowKey = formatJakartaDateKey(new Date(now.getTime() + DAY_MS));
    const dayAfterKey = formatJakartaDateKey(new Date(now.getTime() + 2 * DAY_MS));

    const scheduledSessions = await step.run("fetch-upcoming-bookings", async () => {
      const rows = await db
        .select({
          bookingId: bookings.id,
          groupId: bookings.groupId,
          courseId: bookings.courseId,
          sessionDate: bookings.sessionDate,
          tutorId: tutorSlots.tutorId,
          startTime: tutorSlots.startTime,
          endTime: tutorSlots.endTime,
          courseTitle: courses.title,
        })
        .from(bookings)
        .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
        .leftJoin(courses, eq(bookings.courseId, courses.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            inArray(bookings.sessionDate, [todayKey, tomorrowKey, dayAfterKey]),
          ),
        );

      return rows;
    });

    const stats = await step.run("dispatch-session-reminders", async () => {
      let sentPush = 0;
      let sentEmail = 0;

      await mapConcurrent(scheduledSessions, 5, async (session) => {
        if (!session.sessionDate || !session.startTime) return;
        const startAt = parseJakartaSessionStart(session.sessionDate, session.startTime);
        if (!startAt || startAt <= now) return;

        const window = classifyUpcomingSessionWindow(startAt.getTime() - hourlyTick.getTime());
        if (!window) return;

        const courseTitle = session.courseTitle ?? session.courseId;
        const dedupeKey = `upcoming_session:${session.bookingId}:${window}`;

        const members = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, session.groupId));

        const recipients: Array<{ userId: string; audience: "student" | "tutor" }> = [
          ...members.map((m) => ({ userId: m.userId, audience: "student" as const })),
          ...(session.tutorId ? [{ userId: session.tutorId, audience: "tutor" as const }] : []),
        ];

        for (const recipient of recipients) {
          try {
            const alreadySent = await hasRecentNotificationByDedupeKey({
              userId: recipient.userId,
              type: "tutor_reminder",
              dedupeKey,
            });
            if (alreadySent) continue;

            const locale = (await getUserLocalePreference(recipient.userId)) ?? DEFAULT_LOCALE;
            await sendToUser(
              recipient.userId,
              upcomingSessionReminderPayload({
                audience: recipient.audience,
                window,
                courseTitle,
                sessionDate: session.sessionDate,
                startTime: session.startTime,
                bookingId: session.bookingId,
              }),
              locale,
            );
            sentPush++;

            if (window === "24h" && process.env.RESEND_API_KEY) {
              const emailRes = await sendOptionalEmail({
                userId: recipient.userId,
                category: "events_and_schedules",
                locale,
                render: (resolvedLocale) =>
                  renderUpcomingSessionEmail({
                    locale: resolvedLocale,
                    recipientName:
                      recipient.audience === "tutor"
                        ? resolvedLocale === "en" ? "Tutor" : "Pengajar"
                        : resolvedLocale === "en" ? "Student" : "Siswa",
                    courseTitle,
                    sessionDate: session.sessionDate!,
                    startTime: session.startTime!,
                    endTime: session.endTime ?? session.startTime!,
                    link: recipient.audience === "tutor" ? "/tutor/schedule" : "/dashboard/schedule",
                  }),
              });
              if (emailRes.status === "sent") sentEmail++;
            }
          } catch (err) {
            console.error(
              `[upcoming-session-reminder-cron] Failed for booking ${session.bookingId} user ${recipient.userId}:`,
              err,
            );
          }
        }
      });

      return { sentPush, sentEmail };
    });

    return { inspected: scheduledSessions.length, ...stats };
  },
);

// ─── 4. Tutor Daily Queue Digest Cron (Daily 00:30 UTC / 07:30 WIB) ──────────

export const tutorDailyDigestCron = defineJob(
  {
    id: "tutor-daily-digest-cron",
    name: "Tutor Daily Queue Digest Cron",
    triggers: [{ cron: "30 0 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const dateKey = formatJakartaDateKey(now);
    const dedupeKey = `tutor_digest:${dateKey}`;

    const tutorQueues = await step.run("aggregate-tutor-queues", async () => {
      const pendingTicketRows = await db
        .select({
          tutorId: bookingRescheduleTickets.tutorId,
          count: sql<number>`count(*)::int`,
        })
        .from(bookingRescheduleTickets)
        .where(eq(bookingRescheduleTickets.status, "pending"))
        .groupBy(bookingRescheduleTickets.tutorId);

      const pendingGradingRows = await db
        .select({
          tutorId: tutorCourses.tutorId,
          count: sql<number>`count(distinct ${studentQuizAttempts.id})::int`,
        })
        .from(studentQuizAttempts)
        .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
        .innerJoin(tutorCourses, eq(tutorCourses.courseId, quizTemplates.courseId))
        .where(
          and(
            eq(studentQuizAttempts.status, "completed"),
            eq(studentQuizAttempts.gradingStatus, "pending"),
          ),
        )
        .groupBy(tutorCourses.tutorId);

      const byTutor = new Map<string, { pendingTickets: number; pendingGradings: number }>();
      for (const row of pendingTicketRows) {
        if (!row.tutorId) continue;
        byTutor.set(row.tutorId, {
          pendingTickets: Number(row.count),
          pendingGradings: 0,
        });
      }
      for (const row of pendingGradingRows) {
        if (!row.tutorId) continue;
        const current = byTutor.get(row.tutorId) ?? { pendingTickets: 0, pendingGradings: 0 };
        current.pendingGradings += Number(row.count);
        byTutor.set(row.tutorId, current);
      }

      return Array.from(byTutor.entries())
        .filter(([, counts]) => counts.pendingTickets > 0 || counts.pendingGradings > 0)
        .map(([tutorId, counts]) => ({ tutorId, ...counts }));
    });

    const stats = await step.run("dispatch-tutor-digests", async () => {
      let sent = 0;
      let skipped = 0;

      await mapConcurrent(tutorQueues, 5, async (entry) => {
        try {
          const alreadySent = await hasRecentNotificationByDedupeKey({
            userId: entry.tutorId,
            type: "tutor_digest",
            dedupeKey,
          });
          if (alreadySent) {
            skipped++;
            return;
          }

          await sendToUser(
            entry.tutorId,
            tutorDailyDigestPayload({
              pendingTickets: entry.pendingTickets,
              pendingGradings: entry.pendingGradings,
              dateKey,
            }),
          );
          sent++;
        } catch (err) {
          console.error(`[tutor-daily-digest-cron] Failed for tutor ${entry.tutorId}:`, err);
        }
      });

      return { sent, skipped };
    });

    return { tutorsWithQueue: tutorQueues.length, ...stats };
  },
);
