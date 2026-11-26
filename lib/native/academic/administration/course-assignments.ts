import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listNativeCourseChoices() {
  return db.select({ id: mataKuliah.id, title: mataKuliah.title }).from(mataKuliah)
    .innerJoin(courses, eq(mataKuliah.legacyCourseId, courses.id)).where(eq(mataKuliah.status, "active"))
    .orderBy(asc(mataKuliah.title), asc(mataKuliah.id));
}

export async function lockNativeCourseAssignments(tx: Transaction, requested: string[]) {
  const identities = await Promise.all(requested.map((id) => resolveCourseIdentity(id, tx)));
  const expected = new Map<string, string>();
  for (const identity of identities) {
    if (!identity?.canonicalId || !identity.legacyId || identity.status !== "active" || expected.has(identity.canonicalId)) {
      throw new Error("INVALID_COURSE");
    }
    expected.set(identity.canonicalId, identity.legacyId);
  }
  if (!expected.size) return [];
  const canonical = await tx.select({ id: mataKuliah.id, legacyId: courses.id }).from(mataKuliah)
    .innerJoin(courses, eq(mataKuliah.legacyCourseId, courses.id))
    .where(and(inArray(mataKuliah.id, [...expected.keys()]), eq(mataKuliah.status, "active")))
    .orderBy(asc(mataKuliah.id)).for("share", { of: [mataKuliah, courses] });
  if (canonical.length !== expected.size || canonical.some((course) => expected.get(course.id) !== course.legacyId)) throw new Error("INVALID_COURSE");
  return canonical.map((course) => course.legacyId);
}
