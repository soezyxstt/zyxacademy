import type { OfflineLibraryTarget } from "../../offline/library-model";
export type { OfflineLibraryTarget } from "../../offline/library-model";
import { createOfflineMetadataLifecycle, visibleCourseMetadata } from "../../offline/lifecycle";
import type { NativeOfflineMetadataSnapshot } from "../../offline/metadata-store";
import type { OfflineReadingPackage, OfflineReadingTarget } from "../../offline/reading-contract";
import type { NativeOfflineLocale, NativeOfflineResourceDescriptor, NativeOfflineScope } from "../../offline/sync-contract";
import { materialPath, type MaterialDetailData } from "../../../../packages/native-parity/student/courses/contract";
import type { StudentRoute } from "./contracts";
import { matchStudentRoute } from "./routes";

export type OfflineCourseTarget =
  | { kind: "library" }
  | { kind: "course"; courseId: string }
  | { kind: "material"; courseId: string; materialId: string; section?: string; page?: number }
  | { kind: "unavailable" };

export function offlineCourseTarget(path: string): OfflineCourseTarget {
  const route = matchStudentRoute(path);
  if (route?.pattern === "/dashboard" || route?.pattern === "/courses") return { kind: "library" };
  if (route?.area !== "courses" || !route.params.id) return { kind: "unavailable" };

  const courseId = route.params.id;
  if (route.pattern === "/courses/[id]/material/[materialId]" && route.params.materialId) {
    const page = Number(route.query.page);
    return {
      kind: "material", courseId, materialId: route.params.materialId,
      section: route.query.section,
      page: Number.isSafeInteger(page) && page > 0 ? page : undefined,
    };
  }
  return { kind: "course", courseId };
}

export function offlineLibraryHref(locale: NativeOfflineLocale, target?: OfflineLibraryTarget) {
  return { pathname: "/offline" as const, params: { locale, ...target } };
}

export function canonicalStudentArticleHref(route: StudentRoute, { course, material }: MaterialDetailData): string | undefined {
  if (route.pattern !== "/courses/[id]/material/[materialId]" || route.params.id !== course.id
    || material.locked || material.kind !== "article" || material.group !== "materi" || route.params.materialId === material.id) return;

  try {
    const pathname = materialPath(course.id, material.id);
    if (matchStudentRoute(pathname)?.params.materialId !== material.id) return;
    const suffix = route.path.search(/[?#]/u);
    return suffix === -1 ? pathname : pathname + route.path.slice(suffix);
  } catch {
    return undefined;
  }
}

function findOfflineCourseMaterial<Material extends { id: string }>(materials: readonly Material[], materialId: string): Material | undefined {
  const matches = materials.filter(material => material.id === materialId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function offlineMaterialRecovery<Material extends { id: string }>(
  course: { id: string; materials: readonly Material[] },
  materialId: string,
): { material: Material | undefined; libraryTarget: OfflineLibraryTarget } {
  const material = findOfflineCourseMaterial(course.materials, materialId);
  const libraryTarget = material ? { courseId: course.id, materialId: material.id } : { courseId: course.id };
  return { material, libraryTarget };
}

export type OfflineCourseMetadata = NativeOfflineMetadataSnapshot["courses"][number];

export function studentOfflineCourses(snapshot: NativeOfflineMetadataSnapshot | null, now: number): OfflineCourseMetadata[] {
  // The campaign has an additional enrollment gate outside the base course lease.
  return (visibleCourseMetadata(snapshot, now)?.courses ?? [])
    .filter(course => course.id !== "tutorial-pka")
    .map(course => ({
      ...course,
      materials: course.materials.filter(resource =>
        (resource.kind === "article" || resource.kind === "diktat") && resource.courseId === course.id),
    }));
}

export type AuthorizedOfflineMaterial = {
  scope: NativeOfflineScope;
  resource: NativeOfflineResourceDescriptor & OfflineReadingTarget;
  leaseExpiresAt: number;
  section?: string;
  page?: number;
};

export function selectAuthorizedOfflineMaterial({
  scope, snapshot, target, verifiedUntil, now,
}: {
  scope: NativeOfflineScope;
  snapshot: NativeOfflineMetadataSnapshot | null;
  target: Extract<OfflineCourseTarget, { kind: "material" }>;
  verifiedUntil: number;
  now: number;
}): AuthorizedOfflineMaterial | null {
  if (verifiedUntil <= now) return null;
  const course = studentOfflineCourses(snapshot, now).find(({ id }) => id === target.courseId);
  if (!course?.manifestLeaseExpiresAt) return null;
  const resource = findOfflineCourseMaterial(course.materials, target.materialId);
  if (!resource || resource.courseId !== target.courseId || (resource.kind !== "article" && resource.kind !== "diktat")) return null;
  return {
    scope,
    resource: { ...resource, courseId: resource.courseId, kind: resource.kind },
    leaseExpiresAt: Math.min(verifiedUntil, course.leaseExpiresAt, course.manifestLeaseExpiresAt),
    section: target.section,
    page: target.page,
  };
}

export type VerifiedOfflineMaterial = AuthorizedOfflineMaterial & { saved: OfflineReadingPackage };

export function attachAuthorizedOfflinePackage(
  target: AuthorizedOfflineMaterial,
  saved: OfflineReadingPackage | null,
  now: number,
): VerifiedOfflineMaterial | null {
  if (!saved) return null;
  const { summary } = saved;
  const { resource } = target;
  const leaseExpiresAt = Math.min(target.leaseExpiresAt, summary.leaseExpiresAt);
  if (leaseExpiresAt <= now || summary.key !== resource.key || summary.revision !== resource.revision
    || summary.courseId !== resource.courseId || summary.id !== resource.id || summary.kind !== resource.kind) return null;
  return { ...target, leaseExpiresAt, saved };
}

export function createStudentOfflineCourseLifecycle(
  scope: NativeOfflineScope,
  read: (scope: NativeOfflineScope) => Promise<NativeOfflineMetadataSnapshot | null>,
  now = Date.now,
) {
  return createOfflineMetadataLifecycle({
    read: () => read(scope),
    sync: async () => { throw new Error("Offline Student metadata cannot synchronize."); },
    cancelSync: () => {},
    now,
  });
}
