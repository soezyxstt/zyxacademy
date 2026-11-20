import { and, count, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The caller must hold the question exposure user lock through the attempt write. */
export async function hasQuizAttemptCapacity(
  tx: Transaction,
  studentId: string,
  templateId: string,
  includeInProgress: boolean,
): Promise<boolean> {
  const [template] = await tx.select({ limit: quizTemplates.maxAttempts })
    .from(quizTemplates).where(eq(quizTemplates.id, templateId)).limit(1);
  if (!template) return false;
  if (template.limit === null) return true;

  // An active attempt reserves a slot until completion. Abandoned attempts
  // release their slot because the submission endpoint cannot complete them.
  const [{ used }] = await tx.select({ used: count() })
    .from(studentQuizAttempts)
    .where(and(
      eq(studentQuizAttempts.studentId, studentId),
      eq(studentQuizAttempts.templateId, templateId),
      includeInProgress
        ? inArray(studentQuizAttempts.status, ["completed", "in_progress"])
        : eq(studentQuizAttempts.status, "completed"),
    ));
  return used < template.limit;
}
