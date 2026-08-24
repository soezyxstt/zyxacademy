import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { learningEvents } from "@/db/schema";
import { dualWriteLearningEvent } from "@/lib/migrasi/repository-kompatibilitas";

export interface LearningEventInput {
  id?: string;
  studentId: string;
  courseId: string;
  eventType: "quiz_answer" | "flashcard_review" | "material_completed" | "tutor_question";
  conceptName?: string | null;
  koId?: string | null;
  correctness?: number | null;
  weight?: number;
}

export async function recordLearningEvent(event: LearningEventInput): Promise<void> {
  const row = {
    id: event.id ?? randomUUID(),
    studentId: event.studentId,
    courseId: event.courseId,
    eventType: event.eventType,
    conceptName: event.conceptName ?? null,
    koId: event.koId ?? null,
    correctness: event.correctness ?? null,
    weight: event.weight ?? 1,
    createdAt: new Date(), // explicit: avoids defaultNow() ms raw SQL; mapToDriverValue stores Unix seconds
  };
  await db.transaction(async (tx) => {
    await tx.insert(learningEvents).values(row).onConflictDoNothing({ target: learningEvents.id });
    await dualWriteLearningEvent(tx, row, event.studentId);
  });
}

export async function recordLearningEvents(events: LearningEventInput[]): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();
  const rows = events.map((e) => ({
    id: e.id ?? randomUUID(),
    studentId: e.studentId,
    courseId: e.courseId,
    eventType: e.eventType,
    conceptName: e.conceptName ?? null,
    koId: e.koId ?? null,
    correctness: e.correctness ?? null,
    weight: e.weight ?? 1,
    createdAt: now, // explicit: avoids defaultNow() ms raw SQL; mapToDriverValue stores Unix seconds
  }));
  await db.transaction(async (tx) => {
    await tx.insert(learningEvents).values(rows).onConflictDoNothing({ target: learningEvents.id });
    for (const row of rows) {
      await dualWriteLearningEvent(tx, row, row.studentId);
    }
  });
}
