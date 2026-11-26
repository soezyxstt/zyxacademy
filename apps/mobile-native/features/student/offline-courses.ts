import type { OfflineLibraryTarget } from "../../offline/library-model";
export type { OfflineLibraryTarget } from "../../offline/library-model";
import { createOfflineMetadataLifecycle, visibleCourseMetadata } from "../../offline/lifecycle";
import type { NativeOfflineMetadataSnapshot } from "../../offline/metadata-store";
import type { OfflineReadingPackage, OfflineReadingTarget } from "../../offline/reading-contract";
import type { NativeOfflineLocale, NativeOfflineResourceDescriptor, NativeOfflineScope } from "../../offline/sync-contract";
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
  const matches = course?.materials.filter(resource => resource.id === target.materialId && resource.courseId === target.courseId) ?? [];
  const resource = matches[0];
  if (!course || !course.manifestLeaseExpiresAt || matches.length !== 1
    || resource.courseId !== target.courseId || (resource.kind !== "article" && resource.kind !== "diktat")) return null;
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
