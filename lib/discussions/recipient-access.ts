import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
 courses, discussionChannels, enrollments, mataKuliah, pendaftaranMurid, pengguna,
 penggunaPeran, penugasanTutor, peran, tutorCourses, user,
} from "@/db/schema";
import { isCourseFreeNow } from "@/lib/student/course-pricing";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import type { DiscussionActor } from "./contracts";
import { validDiscussionId } from "./policy";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Transaction;

/** Current access to one channel for a bounded set of recipients. */
export async function getDiscussionRecipientAccess(channelId: string, userIds: readonly string[], client: Connection = db): Promise<Map<string, DiscussionActor>> {
 if (!validDiscussionId(channelId) || userIds.length > 100) throw new Error("DISCUSSION_UNAVAILABLE");
 const ids = [...new Set(userIds.filter(validDiscussionId))];
 if (!ids.length) return new Map();
 const [channelRows, identities] = await Promise.all([
  client.select().from(discussionChannels).where(eq(discussionChannels.id, channelId)).limit(1),
  client.select({ id: pengguna.id, code: peran.code }).from(pengguna)
   .innerJoin(user, eq(user.id, pengguna.id))
   .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id))
   .innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
   .where(and(inArray(pengguna.id, ids), eq(pengguna.status, "active"))),
 ]);
 const channel = channelRows[0];
 if (!channel) throw new Error("DISCUSSION_UNAVAILABLE");
 if (channel.kind !== "global" && channel.kind !== "course") return new Map();
 const roles = new Map<string, Set<string>>();
 for (const row of identities) {
  const codes = roles.get(row.id) ?? new Set<string>();
  codes.add(row.code);
  roles.set(row.id, codes);
 }
 const actors = new Map<string, DiscussionActor>();
 for (const [id, codes] of roles) {
  const role = codes.has("admin") ? "admin" : codes.has("tutor") ? "tutor" : codes.has("murid") ? "student" : null;
  if (role) actors.set(id, { id, role });
 }
 if (channel.kind === "global" || !actors.size) return actors;
 const aliases = [...new Set([channel.courseId, channel.legacyCourseId].filter((id): id is string => !!id))];
 if (!aliases.length) return new Map();

 const [canonical, legacy] = await Promise.all([
  client.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId, status: mataKuliah.status,
   pricingCategory: mataKuliah.pricingCategory, freeStartsAt: mataKuliah.freeStartsAt, freeEndsAt: mataKuliah.freeEndsAt })
   .from(mataKuliah).where(or(inArray(mataKuliah.id, aliases), inArray(mataKuliah.legacyCourseId, aliases))),
  client.select({ id: courses.id }).from(courses).where(inArray(courses.id, aliases)),
 ]);
 for (const alias of aliases) {
  const matches = canonical.filter(row => row.id === alias || row.legacyCourseId === alias);
  const old = legacy.find(row => row.id === alias);
  const current = matches[0];
  if (matches.length > 1 || (current && old && current.legacyCourseId !== old.id)
   || (current ? current.status !== "active" || current.id !== channel.courseId || current.legacyCourseId !== channel.legacyCourseId
    : !old || channel.courseId !== null || old.id !== channel.legacyCourseId)) return new Map();
 }
 if (aliases.includes(PKA_COURSE_ID)) {
  const registered = await client.select({ id: enrollments.userId }).from(enrollments).where(and(
   inArray(enrollments.userId, [...actors.keys()]), eq(enrollments.courseId, PKA_COURSE_ID),
  ));
  const registeredIds = new Set(registered.map(row => row.id));
  for (const [id, actor] of actors) if (actor.role === "student" && !registeredIds.has(id)) actors.delete(id);
 }
 const course = channel.courseId ? canonical.find(row => row.id === channel.courseId) : undefined;
 const now = new Date();
 const students = [...actors.values()].filter(actor => actor.role === "student").map(actor => actor.id);
 const tutors = [...actors.values()].filter(actor => actor.role === "tutor").map(actor => actor.id);
 const [canonicalEnrollments, legacyEnrollments, assignments, legacyAssignments] = await Promise.all([
  students.length && channel.courseId ? client.select({ id: pendaftaranMurid.penggunaId }).from(pendaftaranMurid).where(and(
   inArray(pendaftaranMurid.penggunaId, students), eq(pendaftaranMurid.mataKuliahId, channel.courseId),
   inArray(pendaftaranMurid.status, ["active", "completed"]), or(isNull(pendaftaranMurid.endAt), gt(pendaftaranMurid.endAt, now)),
  )) : [],
  students.length && (channel.legacyCourseId ?? channel.courseId) ? client.select({ id: enrollments.userId }).from(enrollments).where(and(
   inArray(enrollments.userId, students), eq(enrollments.courseId, (channel.legacyCourseId ?? channel.courseId)!), gt(enrollments.expiresAt, now),
  )) : [],
  tutors.length && channel.courseId ? client.select({ id: penugasanTutor.penggunaId, status: penugasanTutor.status, scope: penugasanTutor.assignmentScope })
   .from(penugasanTutor).where(and(inArray(penugasanTutor.penggunaId, tutors), eq(penugasanTutor.mataKuliahId, channel.courseId))) : [],
  tutors.length && channel.courseId && channel.legacyCourseId ? client.select({ id: tutorCourses.tutorId }).from(tutorCourses)
   .where(and(inArray(tutorCourses.tutorId, tutors), eq(tutorCourses.courseId, channel.legacyCourseId))) : [],
 ]);
 const enrolled = new Set([...canonicalEnrollments, ...legacyEnrollments].map(row => row.id));
 const legacyTutors = new Set(legacyAssignments.map(row => row.id));
 const free = !!course && isCourseFreeNow({ category: course.pricingCategory, startsAt: course.freeStartsAt, endsAt: course.freeEndsAt }, now);
 for (const actor of actors.values()) {
  if (actor.role === "student" && !free && !enrolled.has(actor.id)) actors.delete(actor.id);
  if (actor.role === "tutor") {
   const rows = assignments.filter(row => row.id === actor.id);
   if (!rows.some(row => row.status === "active" && row.scope === "course") && (rows.length > 0 || !legacyTutors.has(actor.id))) actors.delete(actor.id);
  }
 }
 return actors;
}
