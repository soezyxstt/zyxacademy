import { defineJob } from "./define-job";
import { db } from "@/db";
import { learningEvents, weeklyReflections, user } from "@/db/schema";
import { computeWeeklyReflection, getPreviousWeekRange, formatDateStr } from "@/lib/reflection-service";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import { hasRecentNotificationByDedupeKey, sendToUser } from "@/lib/notifications/send";
import { weeklyProgressPayload } from "@/lib/notifications/templates";
import { mapConcurrent } from "./vector-sync";
import { gte, lte, and, eq } from "drizzle-orm";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { renderReflectionEmail } from "@/lib/reflection-email-template";

export const weeklyReflectionCron = defineJob(
  {
    id: "weekly-reflection-cron",
    name: "Weekly Reflection Cron",
    triggers: [{ cron: "0 6 * * 1" }], // Monday 06:00 UTC (13:00 WIB)
  },
  async ({ step }) => {
    const now = new Date();
    const { monday, sunday } = getPreviousWeekRange(now);

    // Fetch all student IDs who have had >= 1 learning event during this week
    const activeStudentIds = await step.run("fetch-active-students", async () => {
      const rows = await db
        .selectDistinct({ studentId: learningEvents.studentId })
        .from(learningEvents)
        .where(
          and(
            gte(learningEvents.createdAt, monday),
            lte(learningEvents.createdAt, sunday),
          ),
        );
      return rows.map((r) => r.studentId);
    });

    const { processed, failed } = await step.run("process-reflections-batch", async () => {
      let p = 0;
      let f = 0;
      for (const studentId of activeStudentIds) {
        try {
          await computeWeeklyReflection(studentId, now);
          p++;
        } catch (err) {
          console.error(`Failed to process reflection for student ${studentId}:`, err);
          f++;
        }
      }
      return { processed: p, failed: f };
    });

    if (activeStudentIds.length > 0) {
      const deliveryLocales = await step.run("resolve-reflection-email-locales", async () => {
        const entries = await Promise.all(
          activeStudentIds.map(async (studentId) => [
            studentId,
            (await getUserLocalePreference(studentId)) ?? DEFAULT_LOCALE,
          ] as const),
        );
        return Object.fromEntries(entries) as Record<string, Locale>;
      });

      await step.run("send-reflection-notifications-and-emails-batch", async () => {
        const weekStartStr = formatDateStr(monday);
        const dedupeKey = `weekly_progress:${weekStartStr}`;
        await mapConcurrent(activeStudentIds, 5, async (studentId) => {
          try {
            const [student] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, studentId))
              .limit(1);

            if (!student) {
              console.warn(`No account found for student ${studentId}`);
              return;
            }

            const [reflection] = await db
              .select()
              .from(weeklyReflections)
              .where(
                and(
                  eq(weeklyReflections.studentId, studentId),
                  eq(weeklyReflections.weekStart, weekStartStr),
                ),
              )
              .limit(1);

            if (!reflection) {
              console.warn(`No reflection row found for student ${studentId} and week ${weekStartStr}`);
              return;
            }

            const payload = reflection.payload;
            const completed = payload.completed;
            const streak = payload.streak;
            const locale = deliveryLocales[studentId] ?? DEFAULT_LOCALE;

            const alreadyNotified = await hasRecentNotificationByDedupeKey({
              userId: studentId,
              type: "weekly_progress",
              dedupeKey,
            });
            if (!alreadyNotified) {
              await sendToUser(
                studentId,
                weeklyProgressPayload({
                  quizzes: completed.quizzes,
                  flashcards: completed.flashcards,
                  modules: completed.modules,
                  currentStreak: streak.currentStreak,
                  weekStart: weekStartStr,
                  link: "/dashboard",
                }),
                locale,
              );
            }

            if (process.env.RESEND_API_KEY && !alreadyNotified) {
              await sendOptionalEmail({
                userId: studentId,
                category: "learning_reminders",
                locale,
                render: (resolvedLocale) =>
                  renderReflectionEmail({
                    locale: resolvedLocale,
                    name: student.name,
                    weekStart: weekStartStr,
                    completed,
                    masteryGrowth: payload.masteryGrowth,
                    mostImproved: payload.mostImproved,
                    currentStreak: streak.currentStreak,
                    longestStreak: streak.longestStreak,
                  }),
              });
            }
          } catch (err) {
            console.error(`Failed to deliver weekly reflection to student ${studentId}:`, err);
          }
        });
      });
    }

    return {
      activeStudents: activeStudentIds.length,
      processed,
      failed,
    };
  },
);
