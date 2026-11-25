import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { onboardingTours } from "@/db/schema";
import { applyTourAction, TOUR_VERSION, type TourWriteAction, type TourRole, type TourState } from "./tour-state";

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
    async mutate(userId: string, role: TourRole, action: TourWriteAction): Promise<TourState | null> {
      return database.transaction(async tx => {
        const now = new Date();
        const initial = applyTourAction(null, action, now.toISOString());
        if (initial) {
          await tx.insert(onboardingTours).values({
            userId, role, version: TOUR_VERSION, generation: initial.generation, status: initial.status, stepIndex: initial.stepIndex, courseId: initial.courseId, updatedAt: now,
          }).onConflictDoNothing({ target: [onboardingTours.userId, onboardingTours.role] });
        }

        // Serialize concurrent tabs before applying progress or a terminal choice.
        const scope = and(eq(onboardingTours.userId, userId), eq(onboardingTours.role, role));
        const [row] = await tx.select().from(onboardingTours).where(scope).limit(1).for("update");
        if (!row) return null;
        const current = asState(row);
        const next = applyTourAction(current, action, now.toISOString());
        if (!next || next === current) return current;
        await tx.update(onboardingTours).set({ generation: next.generation, status: next.status, stepIndex: next.stepIndex, courseId: next.courseId, updatedAt: now }).where(scope);
        return next;
      });
    },
  };
}
