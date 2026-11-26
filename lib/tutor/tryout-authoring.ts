import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { exams } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { TryoutInput } from "@/packages/native-parity/academic/assessment/model";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TryoutExam = typeof exams.$inferSelect;
type TryoutMetadata = Omit<TryoutInput, "openAt" | "closeAt"> & { openAt?: string | null; closeAt?: string | null };

function settingsObject(value: unknown): Record<string, unknown> {
  let settings = value;
  if (typeof value === "string") {
    try { settings = JSON.parse(value); } catch { return {}; }
  }
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
}

export function tryoutMetadataRevision(row: TryoutExam): string {
  const { id, courseId, type, title, status, settings, openAt, closeAt, createdAt } = row;
  return revisionOf({ id, courseId, type, title, status, settings, openAt, closeAt, createdAt });
}

export function lockTryoutExam(tx: Transaction, legacyCourseId: string, id: string) {
  return tx.select().from(exams).where(and(eq(exams.id, id), eq(exams.courseId, legacyCourseId),
    eq(exams.type, "tryout"))).limit(1).for("update").then(([row]) => row ?? null);
}

export async function saveTryoutRecord(tx: Transaction, target: { id: string; legacyCourseId: string; previous: TryoutExam | null }, input: TryoutMetadata) {
  const fields = {
    title: input.title,
    status: input.status,
    settings: {
      ...settingsObject(target.previous?.settings),
      timeLimitMinutes: input.timeLimitMinutes,
      maxAttempts: input.maxAttempts,
    },
    openAt: input.openAt ? new Date(input.openAt) : null,
    closeAt: input.closeAt ? new Date(input.closeAt) : null,
  };
  const [saved] = target.previous
    ? await tx.update(exams).set(fields).where(and(eq(exams.id, target.id), eq(exams.courseId, target.legacyCourseId),
      eq(exams.type, "tryout"))).returning()
    : await tx.insert(exams).values({ id: target.id, courseId: target.legacyCourseId, type: "tryout", ...fields }).returning();
  if (!saved) throw new Error("TRYOUT_NOT_FOUND");
  return saved;
}
