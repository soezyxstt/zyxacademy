import { inngest } from "./client";
import { db } from "@/db";
import { learningEvents, weeklyReflections, user } from "@/db/schema";
import { computeWeeklyReflection, getPreviousWeekRange, formatDateStr } from "@/lib/reflection-service";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import { mapConcurrent } from "./vector-sync";
import { gte, lte, and, eq } from "drizzle-orm";

export const weeklyReflectionCron = inngest.createFunction(
  {
    id: "weekly-reflection-cron",
    name: "Weekly Reflection Cron",
    triggers: [{ cron: "0 6 * * 1" }], // Monday 06:00 UTC
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
            lte(learningEvents.createdAt, sunday)
          )
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

    const isEmailEnabled = process.env.FEATURE_REFLECTION_EMAIL === "1";
    if (isEmailEnabled && activeStudentIds.length > 0) {
      await step.run("send-reflection-emails-batch", async () => {
        const weekStartStr = formatDateStr(monday);
        // Process in bounded waves to respect email throughput without arbitrary <=90 cutoff
        await mapConcurrent(activeStudentIds, 5, async (studentId) => {
          try {
            // 1. Fetch student details
            const [student] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, studentId))
              .limit(1);

            if (!student) {
              console.warn(`No account found for student ${studentId}`);
              return;
            }

            // 2. Fetch weekly reflection row
            const [reflection] = await db
              .select()
              .from(weeklyReflections)
              .where(
                and(
                  eq(weeklyReflections.studentId, studentId),
                  eq(weeklyReflections.weekStart, weekStartStr)
                )
              )
              .limit(1);

            if (!reflection) {
              console.warn(`No reflection row found for student ${studentId} and week ${weekStartStr}`);
              return;
            }

            const payload = reflection.payload;
            const completed = payload.completed;
            const streak = payload.streak;

            // 3. Construct email html and send
            await sendOptionalEmail({
              userId: studentId,
              category: "learning_reminders",
              subject: `Weekly Learning Reflection: ${weekStartStr}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
                  <h1 style="font-family: 'Lexend', sans-serif; font-size: 24px; color: #0f172a; margin-top: 0; font-weight: 700;">Halo ${student.name},</h1>
                  <p style="font-size: 16px; line-height: 1.5; color: #475569;">Berikut adalah ringkasan pembelajaran kamu untuk minggu yang dimulai pada <strong>${weekStartStr}</strong>.</p>
                  
                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Aktivitas Terhitung:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Kuis diselesaikan: <strong>${completed.quizzes}</strong></li>
                      <li>Kartu hafalan dipelajari: <strong>${completed.flashcards}</strong></li>
                      <li>Modul diselesaikan: <strong>${completed.modules}</strong></li>
                    </ul>
                  </div>

                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Kemajuan Materi:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Pertumbuhan Pemahaman: <strong>${payload.masteryGrowth > 0 ? "+" : ""}${payload.masteryGrowth}%</strong></li>
                      ${payload.mostImproved ? `<li>Topik Paling Meningkat: <strong>${payload.mostImproved}</strong></li>` : ""}
                    </ul>
                  </div>

                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Streak Belajar:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Streak Saat Ini: <strong>${streak.currentStreak} hari</strong></li>
                      <li>Streak Terpanjang: <strong>${streak.longestStreak} hari</strong></li>
                    </ul>
                  </div>

                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                  <p style="font-size: 14px; color: #64748b; line-height: 1.4; margin-bottom: 0; text-align: center;">
                    Terus tingkatkan belajarmu di <strong>Zyx Academy</strong>!
                  </p>
                </div>
              `
            });
          } catch (err) {
            console.error(`Failed to send reflection email to student ${studentId}:`, err);
          }
        });
      });
    }

    return {
      activeStudents: activeStudentIds.length,
      processed,
      failed,
    };
  }
);
