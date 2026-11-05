import { StudentProfileView } from "@/components/student-profile-view";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createMetadata} from "@/lib/site";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import {
 courses,
 progress,
 submissions,
 bookings,
 tutorSlots,
 groupMembers,
 groups,
 user as userTable,
} from "@/db/schema";
import { listStudentCourses, listStudentEnrollments } from "@/lib/student/course-catalog";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("profile.metadataTitle"), description: t("profile.metadataDescription"), path: "/profile" });
}


/**
 * Server-rendered profile page displaying student user info, ITB academic data, course enrollments, and activity statistics.
 */
export default async function ProfilePage() {
 const h = await headers();
 const session = await auth.api.getSession({ headers: h });
 
 if (!session?.user) {
 redirect("/sign-in?next=/profile");
 }

 const user = session.user;
 const now = new Date();

 let activeEnrollments: any[] = [];
 let completedCount = 0;
 let submissionCount = 0;
 let averageScore: number | null = null;
 let userGroups: any[] = [];
 let studentBookings: any[] = [];

 try {
 if (process.env.NODE_ENV === "development" && user.role === "admin") {
 const all = await listStudentCourses();
 activeEnrollments = all.map((c) => ({
 id: c.id,
 title: c.title,
 category: c.category,
 enrolledAt: now,
 expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
 }));
 } else {
 activeEnrollments = await listStudentEnrollments(user.id);
 }
 } catch (err) {
 console.error("Failed to fetch enrollments:", err);
 }

 try {
 const [progressRes, articleGroups] = await Promise.all([
 db
 .select({ materialId: progress.materialId })
 .from(progress)
 .where(and(eq(progress.userId, user.id), eq(progress.status, "completed"))),
 Promise.all(activeEnrollments.map((course) => getCanonicalPublishedArticlesForCourse(course.id, user.id))),
 ]);
 const completedIds = new Set(progressRes.flatMap((row) => row.materialId ? [row.materialId] : []));
 for (const article of articleGroups.flat()) {
 if (article.completed) completedIds.add(article.id);
 }
 completedCount = completedIds.size;
 } catch (err) {
 console.error("Failed to fetch progress:", err);
 }

 try {
 const submissionsRes = await db
 .select()
 .from(submissions)
 .where(eq(submissions.userId, user.id));
 submissionCount = submissionsRes.length;
 const graded = submissionsRes.filter((s) => s.score !== null);
 averageScore = graded.length > 0
 ? Math.round(graded.reduce((acc, curr) => acc + (curr.score || 0), 0) / graded.length)
 : null;
 } catch (err) {
 console.error("Failed to fetch submissions:", err);
 }

 try {
 userGroups = await db
 .select({
 id: groups.id,
 name: groups.name,
 joinedAt: groupMembers.joinedAt,
 })
 .from(groupMembers)
 .innerJoin(groups, eq(groupMembers.groupId, groups.id))
 .where(eq(groupMembers.userId, user.id));
 } catch (err) {
 console.error("Failed to fetch groups:", err);
 }

 try {
 studentBookings = await db
 .select({
 id: bookings.id,
 bookedAt: bookings.bookedAt,
 courseTitle: courses.title,
 dayOfWeek: tutorSlots.dayOfWeek,
 startTime: tutorSlots.startTime,
 endTime: tutorSlots.endTime,
 tutorName: userTable.name,
 })
 .from(bookings)
 .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
 .innerJoin(courses, eq(bookings.courseId, courses.id))
 .innerJoin(userTable, eq(tutorSlots.tutorId, userTable.id))
 .where(eq(bookings.studentId, user.id));
 } catch (err) {
 console.error("Failed to fetch bookings:", err);
 }

 let dbUser: any = null;
 try {
 const [row] = await db
 .select()
 .from(userTable)
 .where(eq(userTable.id, user.id))
 .limit(1);
 dbUser = row;
 } catch (err) {
 console.error("Failed to fetch user profile:", err);
 }

 return <StudentProfileView user={user} activeEnrollments={activeEnrollments} completedCount={completedCount} submissionCount={submissionCount} averageScore={averageScore} userGroups={userGroups} studentBookings={studentBookings} dbUser={dbUser} />;
}
