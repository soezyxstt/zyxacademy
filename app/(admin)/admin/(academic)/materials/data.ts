import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courses as legacyCourses, mataKuliah, user } from "@/db/schema";
import { env } from "@/lib/env";
import { listAuthoringContextExports } from "@/lib/authoring/export";
import { listAuthoringCourseOptions } from "@/lib/authoring/catalog";
import { listIdeaBundleImports } from "@/lib/bundle/staging";
import { listProductBundleImports, productBundleLifecycleStatus } from "@/lib/bundle/product-staging";
import type { AuthoringContextExportRow } from "@/components/admin/authoring-context-export";
import type { BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import type { BundleRow as ProductBundleRow } from "@/components/admin/product-bundle-v2-panel";

export type MaterialWorkspaceData = {
  initialIdeaImports: IdeaBundleRow[];
  initialProductImports: ProductBundleRow[];
  courseLabels: Record<string, string>;
  authorLabels: Record<string, string>;
  authoringCourses: Awaited<ReturnType<typeof listAuthoringCourseOptions>>;
  initialContextExports: AuthoringContextExportRow[];
  ideaEnabled: boolean;
  productEnabled: boolean;
  authoringEnabled: boolean;
};

export async function loadMaterialWorkspaceData(): Promise<MaterialWorkspaceData> {
  const [ideaRows, productRows, authoringCourses, contextRows, legacyCourseRows, canonicalCourseRows] = await Promise.all([
    env.FEATURE_IDEA_BUNDLE_V2 === "1" ? listIdeaBundleImports() : Promise.resolve([]),
    env.FEATURE_PRODUCT_BUNDLE_V2 === "1" ? listProductBundleImports() : Promise.resolve([]),
    listAuthoringCourseOptions(),
    env.FEATURE_AUTHORING_CONTEXT_V1 === "1" ? listAuthoringContextExports() : Promise.resolve([]),
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
    authoringCourses,
    initialContextExports: contextRows.map((row) => ({
      id: row.id,
      packId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      artifactChecksum: typeof row.afterSnapshot?.artifactChecksum === "string" ? row.afterSnapshot.artifactChecksum : null,
      courseId: typeof row.afterSnapshot?.courseId === "string" ? row.afterSnapshot.courseId : null,
      retentionUntil: typeof row.afterSnapshot?.retentionUntil === "string" ? row.afterSnapshot.retentionUntil : null,
      byteLength: typeof row.afterSnapshot?.byteLength === "number" ? row.afterSnapshot.byteLength : null,
    })),
    ideaEnabled: env.FEATURE_IDEA_BUNDLE_V2 === "1",
    productEnabled: env.FEATURE_PRODUCT_BUNDLE_V2 === "1",
    authoringEnabled: env.FEATURE_AUTHORING_CONTEXT_V1 === "1",
  };
}
