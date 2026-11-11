import "server-only";

import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { mataKuliah, publicDemoSnapshots } from "@/db/schema";
import { db } from "@/lib/db";
import { publicDemoSnapshotSchema, type PublicDemoSnapshot } from "./snapshot";

export type DemoCanonicalCourse = Pick<typeof mataKuliah.$inferSelect, "id" | "title" | "legacyCourseId">;
export type DemoAllowedCourse = { snapshot: PublicDemoSnapshot; title: string };
export type DemoAllowedCourseWithContext = DemoAllowedCourse & {
  course: DemoCanonicalCourse;
  activeAliasCollision: boolean;
};

/** Read explicit opt-ins and check legacy mappings in one batch per render. */
export const getPublicDemoSnapshots = cache(async (): Promise<DemoAllowedCourseWithContext[]> => {
  try {
    const rows = await db.select({ course: { id: mataKuliah.id, title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId }, snapshot: publicDemoSnapshots.snapshot })
      .from(publicDemoSnapshots)
      .innerJoin(mataKuliah, eq(publicDemoSnapshots.courseId, mataKuliah.id))
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title), asc(mataKuliah.id))
      .limit(20);
    const parsed = rows.flatMap(({ course, snapshot }) => {
      const result = publicDemoSnapshotSchema.safeParse(snapshot);
      return result.success && result.data.courseId === course.id ? [{ course, snapshot: result.data }] : [];
    });
    const aliases = [...new Set(parsed.flatMap(({ course }) => [course.id, ...(course.legacyCourseId ? [course.legacyCourseId] : [])]))];
    const mappings = aliases.length ? await db.select({ id: mataKuliah.id, legacyId: mataKuliah.legacyCourseId, status: mataKuliah.status })
      .from(mataKuliah).where(inArray(mataKuliah.legacyCourseId, aliases)) : [];
    return parsed.flatMap(({ course, snapshot }) => {
      const legacyMappings = mappings.filter((item) => item.legacyId === course.legacyCourseId);
      if (course.legacyCourseId && (legacyMappings.length !== 1 || legacyMappings[0].id !== course.id)) return [];
      const activeAliasCollision = mappings.some((item) => item.legacyId === course.id && item.status === "active" && item.id !== course.id);
      return [{ snapshot, title: course.title, course, activeAliasCollision }];
    });
  } catch {
    return [];
  }
});
