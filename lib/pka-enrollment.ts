import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSemesterEndDate } from "@/lib/utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";

/** Idempotent auto-enroll into the Tutorial PKA course. */
export async function ensurePkaEnrollment(userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, PKA_COURSE_ID)))
    .limit(1);

  if (existing) return;

  const now = new Date();
  await db.insert(enrollments).values({
    id: randomUUID(),
    userId,
    courseId: PKA_COURSE_ID,
    enrolledAt: now,
    expiresAt: getSemesterEndDate(now),
  });
}

/**
 * Requires a session on every `/pka/*` entry point (not just the landing
 * page), since subject/stage/report links may be shared or deep-linked
 * directly. Redirects to sign-in with `next` pointing back at `currentPath`,
 * then auto-enrolls. Returns the authenticated user id.
 */
export async function requirePkaSession(currentPath: string): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(currentPath)}`);
  }
  await ensurePkaEnrollment(session.user.id);
  return session.user.id;
}
