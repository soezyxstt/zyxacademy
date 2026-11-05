import { isValid, parseISO } from "date-fns";
import { z } from "zod";
import { formatIsoDateUtc } from "@/lib/date-utils";

const label = z.string().trim().min(1).max(200);
const id = z.string().trim().min(1).max(128);
const count = z.number().int().min(0).max(100000);
const percent = z.number().min(0).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = parseISO(`${value}T00:00:00Z`);
  return isValid(parsed) && formatIsoDateUtc(parsed) === value;
}, "Invalid calendar date");
const unique = (values: string[]) => new Set(values).size === values.length;

export const publicDemoSnapshotSchema = z.object({
  version: z.literal(2),
  contentPolicy: z.literal("free-first-chapter"),
  courseId: id,
  revision: id,
  displayName: label,
  asOf: date,
  streakDays: count,
  mockChapters: z.array(z.object({ id, title: label, orderIndex: count, completionPercent: percent }).strict()).max(100).optional(),
  course: z.object({ completedMaterials: count, totalMaterials: count, nextConcept: label.nullable() }).strict(),
  inProgressDocuments: z.array(z.object({ id, title: label, completionPercent: percent }).strict()).max(100),
  flashcards: z.object({
    dueCount: count,
    recentReviews: z.array(z.object({ id, front: label, grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), reviewedOn: date }).strict()).max(100),
  }).strict(),
  weakConcepts: z.array(z.object({ id, title: label, masteryPercent: percent }).strict()).max(100),
  availableAssessments: z.array(z.object({ id, title: label, type: z.enum(["quiz", "tryout"]) }).strict()).max(100),
  history: z.array(z.object({ date, materialsCompleted: count, flashcardsReviewed: count, quizzesCompleted: count }).strict()).max(366),
}).strict().superRefine((snapshot, ctx) => {
  if (snapshot.course.completedMaterials > snapshot.course.totalMaterials) {
    ctx.addIssue({ code: "custom", path: ["course", "completedMaterials"], message: "Completed exceeds total" });
  }
  for (const [path, values] of [
    ["inProgressDocuments", snapshot.inProgressDocuments.map((item) => item.id)],
    ["flashcards.recentReviews", snapshot.flashcards.recentReviews.map((item) => item.id)],
    ["weakConcepts", snapshot.weakConcepts.map((item) => item.id)],
    ["availableAssessments", snapshot.availableAssessments.map((item) => item.id)],
    ["history", snapshot.history.map((item) => item.date)],
    ["mockChapters", (snapshot.mockChapters ?? []).map((item) => item.id)],
  ] as const) {
    if (!unique(values)) ctx.addIssue({ code: "custom", path: path.split("."), message: "Duplicate identifier" });
  }
  if (snapshot.history.some((item) => item.date > snapshot.asOf)) {
    ctx.addIssue({ code: "custom", path: ["history"], message: "History exceeds asOf" });
  }
});

export type PublicDemoSnapshot = z.infer<typeof publicDemoSnapshotSchema>;

/** Preserve the repository's deterministic order while rejecting invalid rows. */
export function selectPublicDemoSnapshots(rows: readonly { courseId: string; snapshot: unknown }[]): PublicDemoSnapshot[] {
  return rows.flatMap(({ courseId, snapshot }) => {
    const result = publicDemoSnapshotSchema.safeParse(snapshot);
    return result.success && result.data.courseId === courseId ? [result.data] : [];
  });
}

/** Omitted selection is only unambiguous when exactly one course is available. */
export function selectPublicDemoSnapshot(snapshots: readonly PublicDemoSnapshot[], courseId?: string): PublicDemoSnapshot | null {
  if (courseId === undefined) return snapshots.length === 1 ? snapshots[0] : null;
  return snapshots.find((snapshot) => snapshot.courseId === courseId) ?? null;
}

/** Compare a verified quiz token payload to the currently resolved course and questions. */
export function matchesDemoQuizScope(
  payload: { courseId?: unknown; contentPolicy?: unknown; contentRevision?: unknown; questionIds?: unknown; questionVersions?: unknown },
  expected: { courseId: string; contentPolicy: string; contentRevision: string; questionIds: readonly string[]; questionVersions: readonly number[] },
): boolean {
  return payload.courseId === expected.courseId
    && payload.contentPolicy === expected.contentPolicy
    && payload.contentRevision === expected.contentRevision
    && Array.isArray(payload.questionIds)
    && payload.questionIds.length === expected.questionIds.length
    && payload.questionIds.every((id, index) => id === expected.questionIds[index])
    && Array.isArray(payload.questionVersions)
    && payload.questionVersions.length === expected.questionVersions.length
    && payload.questionVersions.every((version, index) => Number.isInteger(version) && version > 0 && version === expected.questionVersions[index]);
}
