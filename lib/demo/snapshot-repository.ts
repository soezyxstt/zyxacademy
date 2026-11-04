import "server-only";

import { asc, eq } from "drizzle-orm";
import { mataKuliah, publicDemoSnapshots } from "@/db/schema";
import { db } from "@/lib/db";
import { publicDemoSnapshotSchema, type PublicDemoSnapshot } from "./snapshot";

export type DemoAllowedCourse = { snapshot: PublicDemoSnapshot; title: string };

/** Read only explicit opt-ins and canonical course metadata. */
export async function getPublicDemoSnapshots(): Promise<DemoAllowedCourse[]> {
  try {
    const rows = await db.select({ course: mataKuliah, snapshot: publicDemoSnapshots.snapshot })
      .from(publicDemoSnapshots)
      .innerJoin(mataKuliah, eq(publicDemoSnapshots.courseId, mataKuliah.id))
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title), asc(mataKuliah.id))
      .limit(20);
    const allowed = await Promise.all(rows.map(async ({ course, snapshot }) => {
      const parsed = publicDemoSnapshotSchema.safeParse(snapshot);
      if (!parsed.success || parsed.data.courseId !== course.id) return null;
      if (course.legacyCourseId) {
        const mappings = await db.select({ id: mataKuliah.id }).from(mataKuliah)
          .where(eq(mataKuliah.legacyCourseId, course.legacyCourseId));
        if (mappings.length !== 1 || mappings[0].id !== course.id) return null;
      }
      return { snapshot: parsed.data, title: course.title };
    }));
    return allowed.filter((row): row is DemoAllowedCourse => row !== null);
  } catch {
    return [];
  }
}
