import { readOfflineChanges, readOfflinePolicy } from "./server-events";
import { assertOfflineActorCurrent, offlineIdentity, type OfflineActor } from "./server-auth";
import { resolveCourseAccessBatch } from "@/lib/student/course-access";
import { offlineCourseAccess, offlineEnrollments, offlineLeaseExpiresAt } from "./server-resources";
import { OFFLINE_SYNC_COURSE_LIMIT, type OfflineSyncRequest, type OfflineSyncResponse } from "./sync-contract";

export async function synchronizeOffline(actor: OfflineActor, input: OfflineSyncRequest): Promise<OfflineSyncResponse> {
  const [policy, enrollments] = await Promise.all([readOfflinePolicy(), offlineEnrollments(actor)]);
  const requested = [...new Set([...(input.courseIds ?? []), ...enrollments.summaries.map(course => course.id)])].slice(0, OFFLINE_SYNC_COURSE_LIMIT);
  const resolved = await resolveCourseAccessBatch(actor.accountId, requested);
  const grants = await Promise.all(requested.map(id => offlineCourseAccess(actor, id, policy, enrollments.records, resolved.get(id))));
  const scopes = [...new Set(grants.flatMap(({ access, publicAccess }) => publicAccess.allowed ? [publicAccess.courseId, access.canonicalCourseId, access.legacyCourseId].filter((id): id is string => Boolean(id)) : []))];
  const delta = await readOfflineChanges(actor.accountId, scopes, input.cursor ?? null, undefined, requested);
  // Grant snapshots must be newer than the acknowledged cursor. A revocation
  // during the initial metadata read cannot renew an obsolete offline lease.
  const [currentEnrollments, currentPolicy] = await Promise.all([offlineEnrollments(actor), readOfflinePolicy()]);
  const currentRequested = [...new Set([...requested, ...currentEnrollments.summaries.map(course => course.id)])].slice(0, OFFLINE_SYNC_COURSE_LIMIT);
  const currentAccess = await resolveCourseAccessBatch(actor.accountId, currentRequested);
  const currentGrants = await Promise.all(currentRequested.map(id => offlineCourseAccess(actor, id, currentPolicy, currentEnrollments.records, currentAccess.get(id))));
  // Writers use canonical or legacy IDs. Return each event under the exact
  // scope IDs held by this device so no alias silently misses an invalidation.
  const changes = delta.changes.flatMap(change => {
    if (!change.courseId) return [change];
    const aliases = [...new Set([...grants, ...currentGrants].filter(({ access, publicAccess }) => [publicAccess.courseId, access.canonicalCourseId, access.legacyCourseId].includes(change.courseId)).map(({ publicAccess }) => publicAccess.courseId))];
    return aliases.length ? aliases.map(courseId => ({ ...change, courseId })) : [change];
  });
  await assertOfflineActorCurrent(actor);
  const serverTime = Date.now();
  return { ...offlineIdentity(actor), ...delta, changes, serverTime, leaseExpiresAt: offlineLeaseExpiresAt(actor, currentPolicy, serverTime), policy: currentPolicy, enrollments: currentEnrollments.summaries, access: currentGrants.map(({ publicAccess }) => publicAccess) };
}
