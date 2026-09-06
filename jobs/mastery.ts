import { inngest } from "./client";
import { db } from "@/db";
import { user, studentConceptMastery, studentConceptMasteryHistory } from "@/db/schema";
import { daysAgo, todayUtc } from "@/lib/date-utils";
import { recomputeTrends } from "@/lib/mastery-store";
import { enqueueRecompute, processQueueBatch, recomputePerIdeaMastery } from "@/lib/mastery-recompute";
import { eq, and, gt, inArray } from "drizzle-orm";

export const masteryRecomputeWorker = inngest.createFunction(
  {
    id: "mastery-recompute-worker",
    name: "Mastery Recompute Worker",
    triggers: [{ event: "mastery/recompute.requested" }],
    debounce: {
      key: "event.data.studentId",
      period: "30s",
    },
  },
  async ({ event, step }) => {
    const { studentId, courseId, reason } = event.data as { studentId: string; courseId: string; reason?: string };

    await step.run("process-recompute-job", async () => {
      await enqueueRecompute(studentId, courseId, reason || "inngest_trigger");
      await processQueueBatch();
    });

    return { studentId, courseId };
  }
);

export const ideaMasteryRecomputeWorker = inngest.createFunction(
  {
    id: "idea-mastery-recompute-v1",
    name: "Per-Idea Mastery Recompute V1",
    triggers: [{ event: "mastery/idea-recompute.requested.v1" }],
    debounce: {
      key: "event.data.studentId",
      period: "30s",
    },
  },
  async ({ event, step }) => {
    const { studentId, ideaId, idempotencyKey } = event.data as {
      studentId: string;
      ideaId: string;
      idempotencyKey: string;
    };
    const stepKey = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return step.run(`recompute-idea-${stepKey}`, async () => {
      const result = await recomputePerIdeaMastery(studentId, ideaId, {
        mode: "incremental",
        reason: "idea_mastery_event_v1",
      });
      return {
        status: "processed" as const,
        ideaId,
        changed: result.changed,
        stateHash: result.stateHash,
      };
    });
  },
);

/**
 * Daily cron running off-peak (19:00 UTC) to snapshot student mastery
 * and update trend directions.
 */
export const masterySnapshotCron = inngest.createFunction(
  {
    id: "mastery-snapshot-cron",
    name: "Mastery Snapshot Cron",
    triggers: [{ cron: "0 19 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    const thirtyDaysAgo = daysAgo(30, now);

    const activeStudentIds = await step.run("fetch-active-students", async () => {
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.role, "student"),
            gt(user.lastActivityAt, thirtyDaysAgo)
          )
        );
      return rows.map((r) => r.id);
    });

    if (activeStudentIds.length === 0) {
      return { activeStudents: 0, snapshotsWritten: 0 };
    }

    const todayStr = todayUtc();

    const result = await step.run("snapshot-and-recompute-trends", async () => {
      let snapshotsWritten = 0;
      for (let i = 0; i < activeStudentIds.length; i += 50) {
        const studentChunk = activeStudentIds.slice(i, i + 50);
        const masteryRows = await db
          .select()
          .from(studentConceptMastery)
          .where(inArray(studentConceptMastery.studentId, studentChunk));

        if (masteryRows.length > 0) {
          const snapshotInserts = masteryRows.map((r) => ({
            id: crypto.randomUUID(),
            studentId: r.studentId,
            courseId: r.courseId,
            conceptName: r.conceptName,
            masteryScore: r.masteryScore,
            confidence: r.confidence,
            snapshotDate: todayStr,
          }));

          for (let j = 0; j < snapshotInserts.length; j += 100) {
            await db
              .insert(studentConceptMasteryHistory)
              .values(snapshotInserts.slice(j, j + 100))
              .onConflictDoNothing();
          }
          snapshotsWritten += snapshotInserts.length;
        }

        for (const studentId of studentChunk) {
          await recomputeTrends(studentId);
        }
      }

      return { snapshotsWritten };
    });

    return {
      activeStudents: activeStudentIds.length,
      snapshotsWritten: result.snapshotsWritten,
    };
  }
);
