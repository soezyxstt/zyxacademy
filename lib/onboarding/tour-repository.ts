import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { onboardingTours } from "@/db/schema";
import { applyTourAction, TOUR_VERSION, type TourWriteAction, type TourRole, type TourState, type TourMutationResult } from "./tour-state";

type TourDatabase = Pick<typeof db, "select" | "transaction">;

function asState(row: typeof onboardingTours.$inferSelect): TourState {
  return { version: TOUR_VERSION, generation: row.generation, status: row.status, stepIndex: row.stepIndex, courseId: row.courseId, updatedAt: row.updatedAt.toISOString() };
}

export function createTourRepository(database: TourDatabase) {
  return {
    async get(userId: string, role: TourRole): Promise<TourState | null> {
      const [row] = await database.select().from(onboardingTours)
        .where(and(eq(onboardingTours.userId, userId), eq(onboardingTours.role, role))).limit(1);
      return row ? asState(row) : null;
    },
    async mutate(userId: string, role: TourRole, action: TourWriteAction): Promise<TourMutationResult> {
      return database.transaction(async tx => {
        const now = new Date();
        const initial = applyTourAction(null, action, now.toISOString());
        let created = false;
        if (initial) {
          const inserted = await tx.insert(onboardingTours).values({
            userId, role, version: TOUR_VERSION, generation: initial.generation, status: initial.status, stepIndex: initial.stepIndex, courseId: initial.courseId, updatedAt: now,
          }).onConflictDoNothing({ target: [onboardingTours.userId, onboardingTours.role] }).returning({ userId: onboardingTours.userId });
          created = inserted.length > 0;
        }

        // Serialize concurrent tabs before applying progress or a terminal choice.
        const scope = and(eq(onboardingTours.userId, userId), eq(onboardingTours.role, role));
        const [row] = await tx.select().from(onboardingTours).where(scope).limit(1).for("update");
        if (!row) return { state: null, applied: false };
        const current = asState(row);
        const next = applyTourAction(current, action, now.toISOString());
        if (!next || next === current) return { state: current, applied: created };
        await tx.update(onboardingTours).set({ generation: next.generation, status: next.status, stepIndex: next.stepIndex, courseId: next.courseId, updatedAt: now }).where(scope);
        return { state: next, applied: true };
      });
    },
  };
}
