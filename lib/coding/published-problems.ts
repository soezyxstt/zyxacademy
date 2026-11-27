import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codingProblems } from "@/db/schema";
import { toPublicCodingProblem } from "./contracts";

export async function listPublishedCodingProblems(courseId: string) {
  const rows = await db.select().from(codingProblems)
    .where(and(eq(codingProblems.courseId, courseId), eq(codingProblems.status, "published")))
    .orderBy(desc(codingProblems.version), codingProblems.id).limit(100);
  return rows.flatMap(row => {
    const problem = toPublicCodingProblem(row.snapshot);
    return problem.courseId === row.courseId && problem.problemId === row.id && problem.version === row.version ? [problem] : [];
  });
}
