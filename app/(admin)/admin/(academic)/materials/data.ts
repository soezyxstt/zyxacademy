import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courses as legacyCourses, mataKuliah, user } from "@/db/schema";
import { listIdeaBundleImports } from "@/lib/bundle/staging";
import { listProductBundleImports, productBundleLifecycleStatus } from "@/lib/bundle/product-staging";
import type { BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import type { MaterialBundleRow as ProductBundleRow } from "@/components/admin/material-workflow-ui";

export type MaterialWorkspaceData = {
  initialIdeaImports: IdeaBundleRow[];
  initialProductImports: ProductBundleRow[];
  courseLabels: Record<string, string>;
  authorLabels: Record<string, string>;
  ideaEnabled: boolean;
  productEnabled: boolean;
};

export async function loadMaterialWorkspaceData(options?: { courseIds?: string[] }): Promise<MaterialWorkspaceData> {
  const courseIds = options?.courseIds?.filter(Boolean);
  const bundleOptions = courseIds && courseIds.length > 0 ? { limit: 50, courseIds } : 50;
  const [ideaRows, productRows, legacyCourseRows, canonicalCourseRows] = await Promise.all([
    listIdeaBundleImports(bundleOptions),
    listProductBundleImports(bundleOptions),
    db.select({ id: legacyCourses.id, title: legacyCourses.title }).from(legacyCourses).orderBy(asc(legacyCourses.title)),
    db.select({ id: mataKuliah.id, code: mataKuliah.code, title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).orderBy(asc(mataKuliah.title)),
  ]);

  const requestedByIds = [...new Set(
    [...ideaRows, ...productRows]
      .map((row) => row.requestedBy)
      .filter((id): id is string => Boolean(id)),
  )];
  const authorRows = requestedByIds.length > 0
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, requestedByIds))
    : [];

  const courseLabels: Record<string, string> = Object.fromEntries(legacyCourseRows.map((course) => [course.id, course.title]));
  for (const course of canonicalCourseRows) {
    const label = `${course.code} · ${course.title}`;
    courseLabels[course.id] = label;
    if (course.legacyCourseId) courseLabels[course.legacyCourseId] = label;
  }

  return {
    initialIdeaImports: ideaRows.map((row) => ({
      id: row.id,
      bundleId: row.bundleId,
      checksum: row.checksum,
      courseId: row.courseId,
      requestedBy: row.requestedBy,
      status: row.status,
      validationReport: row.validationReport,
      createdAt: row.createdAt.toISOString(),
    })),
    initialProductImports: productRows.map((row) => ({
      id: row.id,
      bundleId: row.bundleId,
      checksum: row.checksum,
      courseId: row.courseId,
      requestedBy: row.requestedBy,
      status: productBundleLifecycleStatus(row.status),
      validationReport: row.validationReport,
      createdAt: row.createdAt.toISOString(),
    })),
    courseLabels,
    authorLabels: Object.fromEntries(authorRows.map((author) => [author.id, author.name || author.email])),
    ideaEnabled: true,
    productEnabled: true,
  };
}
