import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingResources, bookings, exams, groupMembers, groups, imporBundle, submissions, tutorSlots } from "@/db/schema";
import { hasPeran } from "@/lib/auth/authorization";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { isReviewableSubmissionStatus } from "@/lib/tutor/assessment-policy";
import { slugifySegment } from "./keys";

type Access = { allowed: boolean; owners?: Set<string> };

export async function authorizeScopedStorageFile(
  kind: "tryout" | "tutorial" | "product-bundle",
  key: string,
  userId: string,
  candidates: string[],
  submissionId: string | null,
): Promise<Access> {
  if (kind === "product-bundle") {
    if (!(await hasPeran(userId, "admin"))) return { allowed: false };
    const [bundle] = await db.select({ id: imporBundle.id }).from(imporBundle).where(and(
      eq(imporBundle.bundleType, "product"),
      eq(imporBundle.status, "draft"),
      eq(imporBundle.sourceUriOrKey, key),
    )).limit(1);
    return { allowed: Boolean(bundle) };
  }

  if (kind === "tryout") {
    const [, examSlug] = key.split("/");
    const submissionsWithFile = await db.select({
      ownerId: submissions.userId,
      answers: submissions.answersSnapshot,
      status: submissions.status,
      examId: exams.id,
      courseId: exams.courseId,
    }).from(submissions).innerJoin(exams, eq(exams.id, submissions.examId)).where(and(
      eq(exams.type, "tryout"),
      inArray(exams.status, ["published", "ended"]),
      submissionId ? eq(submissions.id, submissionId) : sql`jsonb_path_exists(
        ${submissions.answersSnapshot}, '$.* ? (@.type == "essay" && @.fileKey == $key)',
        jsonb_build_object('key', ${key}::text), true
      )`,
    ));
    const owners = new Set<string>();
    for (const submission of submissionsWithFile) {
      if (slugifySegment(submission.examId, "exam") !== examSlug || !hasTryoutFile(submission.answers, key)) continue;
      const allowed = submission.ownerId === userId
        ? (await resolveCourseAccess({ courseId: submission.courseId, userId })).hasFullContentAccess
        : isReviewableSubmissionStatus(submission.status) &&
          (await checkTutorCourseAccess(userId, submission.courseId, { allowAdmin: true })).hasAccess;
      if (allowed) owners.add(submission.ownerId);
    }
    return { allowed: owners.size > 0, owners };
  }

  const [, bookingId, folder] = key.split("/");
  const phase = folder === "pre_session" ? "pre" : "post";
  const [booking] = await db.select({
    id: bookings.id,
    groupId: bookings.groupId,
    courseId: bookings.courseId,
    tutorId: tutorSlots.tutorId,
    preSessionAttachments: bookings.preSessionAttachments,
    postSessionAttachments: bookings.postSessionAttachments,
  }).from(bookings).innerJoin(tutorSlots, eq(tutorSlots.id, bookings.slotId)).where(and(
    eq(bookings.id, bookingId),
    inArray(bookings.status, ["scheduled", "completed", "rescheduled"]),
  )).limit(1);
  if (!booking) return { allowed: false };
  const allowed = await hasPeran(userId, "admin") ||
    (booking.tutorId === userId && (await checkTutorCourseAccess(userId, booking.courseId)).hasAccess) ||
    await canReadGroupFile(booking, userId);
  if (!allowed) return { allowed: false };

  const resources = await db.select({ url: bookingResources.url }).from(bookingResources).where(and(
    eq(bookingResources.bookingId, booking.id),
    eq(bookingResources.phase, phase),
    eq(bookingResources.kind, "file"),
  ));
  const legacy = phase === "pre" ? booking.preSessionAttachments : booking.postSessionAttachments;
  const references = resources.length > 0 ? resources : Array.isArray(legacy) ? legacy : [];
  return { allowed: references.some((reference) => reference && candidates.includes(reference.url)) };
}

function hasTryoutFile(snapshot: unknown, key: string): boolean {
  if (typeof snapshot === "string") {
    try { snapshot = JSON.parse(snapshot); } catch { return false; }
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  return Object.values(snapshot).some((answer: unknown) => {
    const entry = answer as { type?: string; fileKey?: string } | null;
    return entry?.type === "essay" && entry.fileKey === key;
  });
}

async function canReadGroupFile(booking: { groupId: string; courseId: string }, userId: string): Promise<boolean> {
  const [member] = await db.select({ id: groupMembers.id }).from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(and(
      eq(groupMembers.groupId, booking.groupId),
      eq(groupMembers.userId, userId),
      eq(groups.status, "active"),
      or(isNull(groups.endDate), gt(groups.endDate, new Date())),
    )).limit(1);
  return Boolean(member && (await resolveCourseAccess({ userId, courseId: booking.courseId })).hasFullContentAccess);
}
