import {
  compareNativeOfflineCursors as compareCursor,
  isNativeOfflineCursor,
  NATIVE_OFFLINE_COURSE_LIMIT,
  NATIVE_OFFLINE_MANIFEST_ENTRY_LIMIT,
  type NativeOfflineCourseAccess,
  type NativeOfflineLocale,
  type NativeOfflineManifestResponse,
  type NativeOfflineResourceDescriptor,
  type NativeOfflineScope,
  type NativeOfflineSyncResponse,
} from "./sync-contract";
import type { NativeSessionScope } from "../network/transport";
import type { OfflinePolicy } from "../../../lib/offline/policy-types";
import { notifyOfflineReadingChanges } from "./reading-events";
import { catalogGrant, type OfflineCatalogTarget, type OfflineLibraryCatalog } from "./catalog-model";

// These storage bounds mirror lib/offline/metadata-cache.ts and sync-contract.ts.
const maxMetadataBytes = 8 * 1024 * 1024;
const maxCatalogBytes = 1536 * 1024;
const maxReadingInvalidations = 512;
export const EXPO_OFFLINE_DATABASE_NAME = "zyx-offline-reading-metadata.db";
export const offlineMetadataSchema = `
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS offline_reading_metadata_v1 (
    origin TEXT NOT NULL,
    account_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    session_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    snapshot TEXT,
    PRIMARY KEY (origin, account_id, locale)
  );
`;

type Bind = string | number | null;
export type OfflineMetadataDatabase = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  runAsync(sql: string, ...params: Bind[]): Promise<{ changes: number }>;
};

type StoredManifest = {
  cursor: string;
  checkedAt: number | null;
  leaseExpiresAt: number;
  materials: NativeOfflineResourceDescriptor[];
};
type StoredCourse = NativeOfflineCourseAccess & { title: string; grantRevision?: number; manifest?: StoredManifest };
export type OfflineReadingCourseVersion = { locale: NativeOfflineLocale; revision: number };
export type OfflineReadingDeletion = { courseId: string; key: string; cursor: string };
export type OfflineReadingRestrictions = {
  grants: readonly NativeOfflineCourseAccess[];
  deletions: readonly OfflineReadingDeletion[];
  manifests?: readonly NativeOfflineManifestResponse[];
  manifestGrantCursors?: ReadonlyMap<string, string>;
};
type ReadingValidation = { generation: number; invalidations: Record<string, string> };
type StoredSnapshot = {
  sessionId: string;
  cursor: string | null;
  lastVerifiedAt: number;
  leaseExpiresAt: number;
  activeCheckIntervalMs?: number;
  metadataMaxAgeMs?: number;
  catalogs?: OfflineLibraryCatalog[];
  readingPolicy?: Pick<OfflinePolicy, "maxBytes" | "maxEntries" | "retentionMs" | "contentMaxAgeMs">;
  readingValidation?: ReadingValidation;
  pending?: { cursor: string; reset: boolean };
  courses: StoredCourse[];
};
type RawRow = { revision: number; session_id: string; snapshot: string | null };
type MetadataPage = { expectedCursor: string | null; response: NativeOfflineSyncResponse };
export type OfflineMetadataAccessPage = MetadataPage & { expectedRevision?: number; reapply?: boolean };
type WriterGuard = () => void;
const metadataKeys = (scope: NativeOfflineScope) => [scope.origin, scope.accountId, scope.locale] as const;

export type NativeOfflineMetadataSnapshot = {
  cursor: string | null;
  knownCourseIds: string[];
  activeCheckIntervalMs?: number;
  metadataMaxAgeMs?: number;
  catalogs?: OfflineLibraryCatalog[];
  courses: Array<{
    id: string;
    title: string;
    catalogGrant?: string;
    leaseExpiresAt: number;
    manifestCheckedAt?: number;
    manifestLeaseExpiresAt?: number;
    materials: NativeOfflineResourceDescriptor[];
  }>;
};

function requireIdentity(scope: NativeOfflineScope, response: NativeOfflineSyncResponse | NativeOfflineManifestResponse) {
  if (response.protocolVersion !== 1 || response.accountId !== scope.accountId || response.sessionId !== scope.sessionId
    || response.environment !== scope.origin || response.locale !== scope.locale || !isNativeOfflineCursor(response.cursor)) {
    throw new Error("Offline metadata identity mismatch.");
  }
}

function readSnapshot(row: RawRow | null): StoredSnapshot | null {
  if (!row?.snapshot) return null;
  try {
    const value = JSON.parse(row.snapshot) as StoredSnapshot | null;
    if (value && value.sessionId === row.session_id && Array.isArray(value.courses)
      && (value.cursor === null || isNativeOfflineCursor(value.cursor))
      && Number.isFinite(value.leaseExpiresAt) && Number.isFinite(value.lastVerifiedAt)) return value;
  } catch { /* Invalid metadata is recovered through a fresh synchronization. */ }
  return null;
}

function readAuthorityRow(db: Pick<OfflineMetadataDatabase, "getFirstAsync">, scope: NativeOfflineScope) {
  return db.getFirstAsync<RawRow>(
    "SELECT revision, session_id, snapshot FROM offline_reading_metadata_v1 WHERE origin = ? AND account_id = ? AND locale = ?",
    scope.origin, scope.accountId, scope.locale,
  );
}

export async function readOfflineReadingAuthority(db: Pick<OfflineMetadataDatabase, "getFirstAsync">, scope: NativeOfflineScope) {
  const row = await readAuthorityRow(db, scope);
  const snapshot = readSnapshot(row);
  return snapshot && snapshot.sessionId === scope.sessionId ? snapshot : null;
}

export async function readOfflineReadingAuthorities(
  db: { getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]> },
  session: NativeSessionScope,
) {
  const rows = await db.getAllAsync<RawRow & { locale: NativeOfflineLocale }>(`
    SELECT revision, session_id, snapshot, locale FROM offline_reading_metadata_v1
    WHERE origin = ? AND account_id = ? AND session_id = ? AND locale IN ('id', 'en')
  `, session.origin, session.accountId, session.sessionId);
  return rows.flatMap(row => {
    const snapshot = readSnapshot(row);
    return snapshot ? [{ locale: row.locale, revision: row.revision, snapshot }] : [];
  });
}

export function readOfflineReadingAuthorityVersions(
  db: { getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]> },
  session: NativeSessionScope,
) {
  return db.getAllAsync<OfflineReadingCourseVersion>(`
    SELECT locale, revision FROM offline_reading_metadata_v1
    WHERE origin = ? AND account_id = ? AND session_id = ? AND locale IN ('id', 'en') AND snapshot IS NOT NULL
  `, session.origin, session.accountId, session.sessionId);
}

export async function withdrawOfflineReadingCourses(
  tx: Pick<OfflineMetadataDatabase, "getFirstAsync" | "runAsync">,
  session: NativeSessionScope,
  courseIds: readonly string[],
  version: OfflineReadingCourseVersion,
  assertCurrent: WriterGuard,
): Promise<string[]> {
  const scope = { ...session, locale: version.locale };
  const row = await readAuthorityRow(tx, scope);
  const snapshot = readSnapshot(row);
  // Grant and generation revisions come from the containing row. Older grants use the whole row as their bound.
  if (!row || snapshot?.sessionId !== scope.sessionId || row.revision < version.revision
    || (snapshot.readingValidation?.generation ?? 0) > version.revision) return [];
  const grantRevisions = new Map(snapshot.courses.map(course => [course.courseId, course.grantRevision ?? row.revision]));
  const denied = new Set(courseIds.filter(id => (grantRevisions.get(id) ?? row.revision) <= version.revision));
  if (!denied.size) return [];
  const withdrawn = { ...snapshot, courses: snapshot.courses.filter(course => !denied.has(course.courseId)) };
  assertCurrent();
  // Advancing the row revision also prevents a pending manifest from restoring this grant.
  const { changes } = await tx.runAsync(`
    UPDATE offline_reading_metadata_v1 SET revision = revision + 1, snapshot = ?
    WHERE origin = ? AND account_id = ? AND locale = ? AND session_id = ? AND revision = ?
  `, JSON.stringify(withdrawn), ...metadataKeys(scope), scope.sessionId, row.revision);
  return changes === 1 ? [...denied] : [];
}

function allowedChapters(grant: NativeOfflineCourseAccess, resource: NativeOfflineResourceDescriptor) {
  // Keep the same conservative chapter proof as lib/offline/sync-client.ts.
  return grant.allowed && resource.chapterIds.length > 0
    && resource.chapterIds.every(chapter => grant.chapterIds.includes(chapter));
}

export function equivalentOfflineCourseAccess(left: NativeOfflineCourseAccess, right: NativeOfflineCourseAccess) {
  return left.courseId === right.courseId && left.allowed === right.allowed && left.fullContent === right.fullContent
    && left.chapterIds.length === right.chapterIds.length && left.chapterIds.every(chapter => right.chapterIds.includes(chapter));
}

export type OfflineReadingRemoval = {
  denied: string[];
  chapterLimits: Map<string, string[]>;
  deleted: Map<string, string>;
  omitted: Map<string, { keys: Set<string>; cursor: string }>;
};

export async function restrictOfflineReadingAuthority(
  tx: Pick<OfflineMetadataDatabase, "getFirstAsync" | "runAsync">,
  scope: NativeOfflineScope,
  version: number,
  { grants, deletions, manifests = [], manifestGrantCursors }: OfflineReadingRestrictions,
  assertCurrent: WriterGuard,
): Promise<OfflineReadingRemoval | null> {
  const row = await readAuthorityRow(tx, scope);
  const snapshot = readSnapshot(row);
  if (!row || snapshot?.sessionId !== scope.sessionId || row.revision < version
    || (snapshot.readingValidation?.generation ?? 0) > version) return null;
  const courses = new Map(snapshot.courses.map(course => [course.courseId, course]));
  const eligible = (id: string) => (courses.get(id)?.grantRevision ?? row.revision) <= version;
  const removal: OfflineReadingRemoval = { denied: [], chapterLimits: new Map(), deleted: new Map(), omitted: new Map() };
  for (const event of deletions) {
    const course = courses.get(event.courseId);
    const cursor = course?.manifest?.cursor ?? snapshot.cursor;
    const newer = snapshot.readingValidation?.invalidations[event.key];
    if (eligible(event.courseId) && (!cursor || compareCursor(cursor, event.cursor) <= 0)
      && (!newer || compareCursor(newer, event.cursor) <= 0)) removal.deleted.set(event.key, event.cursor);
  }
  for (const manifest of manifests) {
    const prior = courses.get(manifest.resource.courseId);
    if (prior?.manifest && !snapshot.pending?.reset && eligible(prior.courseId)
      && Math.min(snapshot.leaseExpiresAt, prior.leaseExpiresAt, prior.manifest.leaseExpiresAt) > manifest.serverTime
      && equivalentOfflineCourseAccess(prior, manifest.resource) && compareCursor(prior.manifest.cursor, manifest.cursor) <= 0) {
      removal.omitted.set(prior.courseId, { keys: new Set(manifest.resources.map(item => item.key)), cursor: manifest.cursor });
    }
  }
  for (const grant of grants) {
    if (!eligible(grant.courseId)) continue;
    if (!grant.allowed) {
      removal.denied.push(grant.courseId);
      courses.delete(grant.courseId);
      continue;
    }
    const prior = courses.get(grant.courseId);
    const cursor = manifestGrantCursors?.get(grant.courseId);
    if (!prior?.allowed || (cursor && prior.manifest && compareCursor(prior.manifest.cursor, cursor) > 0)) continue;
    const chapterIds = prior.chapterIds.filter(chapter => grant.chapterIds.includes(chapter));
    const fullContent = prior.fullContent && grant.fullContent;
    if (chapterIds.length === prior.chapterIds.length && fullContent === prior.fullContent) continue;
    removal.chapterLimits.set(grant.courseId, chapterIds);
    courses.set(grant.courseId, { ...prior, chapterIds, fullContent, grantRevision: row.revision + 1 });
  }

  let changed = removal.denied.length > 0 || removal.chapterLimits.size > 0 || removal.deleted.size > 0;
  for (const [courseId, course] of courses) {
    const stored = course.manifest;
    if (!stored) continue;
    const omitted = removal.omitted.get(courseId);
    const materials = stored.materials.filter(item => !removal.deleted.has(item.key)
      && (!removal.chapterLimits.has(courseId) || allowedChapters(course, item))
      && (!omitted || omitted.keys.has(item.key)
        || compareCursor(snapshot.readingValidation?.invalidations[item.key] ?? "0", omitted.cursor) > 0));
    if (materials.length === stored.materials.length) continue;
    courses.set(courseId, { ...course, manifest: { ...stored, checkedAt: null, materials } });
    changed = true;
  }
  if (!changed) return removal;
  assertCurrent();
  // Advancing the row revision fences any other pass based on the earlier projection.
  const updated = await writeOfflineReadingSnapshot(tx, scope, row.revision,
    JSON.stringify({ ...snapshot, courses: [...courses.values()] }));
  return updated ? removal : null;
}

function usableCatalogs(catalogs: readonly OfflineLibraryCatalog[], courses: readonly StoredCourse[], now: number) {
  return catalogs.flatMap(catalog => {
    if (catalog.leaseExpiresAt <= now) return [];
    if (catalog.kind === "achievement_catalog") return [catalog] as OfflineLibraryCatalog[];
    const course = courses.find(item => item.courseId === catalog.courseId);
    if (!course?.allowed || course.leaseExpiresAt <= now || catalog.grant !== catalogGrant(course)) return [];
    return [{ ...catalog, leaseExpiresAt: Math.min(catalog.leaseExpiresAt, course.leaseExpiresAt), videos: catalog.videos.map(video =>
      video.thumbnail && video.thumbnail.leaseExpiresAt <= now ? { ...video, thumbnail: undefined } : video) }] as OfflineLibraryCatalog[];
  });
}

function invalidatedCatalog(catalog: OfflineLibraryCatalog, response: NativeOfflineSyncResponse) {
  return response.changes.some(change => compareCursor(change.cursor, catalog.cursor) >= 0 &&
    (!change.courseId || catalog.courseId === change.courseId) &&
    (change.kind === "policy" || change.kind === "access" || change.kind === "course" ||
      change.kind === catalog.kind || catalog.kind === "video_catalog" && change.kind === "course_outline"));
}

function applyPageAccess(previous: StoredSnapshot | null, response: NativeOfflineSyncResponse, nextRevision: number, reapply: boolean): StoredSnapshot {
  const courses = new Map((response.reset ? [] : previous?.courses ?? []).map(course => [course.courseId, course]));
  const previousGrantRevisions = new Map((reapply ? previous?.courses ?? [] : []).map(course => [course.courseId, course.grantRevision]));
  const verificationGeneration = (reapply ? previous?.readingValidation?.generation : undefined) ?? nextRevision;
  const enrollments = new Map(response.enrollments.map(course => [course.id, course]));
  const grants = new Map(response.access.map(grant => [grant.courseId, grant]));
  let readingValidation: ReadingValidation = !response.reset && previous?.readingValidation
    ? { ...previous.readingValidation, invalidations: { ...previous.readingValidation.invalidations } }
    : { generation: verificationGeneration, invalidations: {} };
  for (const change of response.changes) {
    if (change.kind === "article" || change.kind === "diktat") {
      if (change.courseId && change.resourceId) {
        const key = JSON.stringify([change.kind, change.courseId, change.resourceId]);
        const earlier = readingValidation.invalidations[key];
        if (!earlier || compareCursor(change.cursor, earlier) >= 0) readingValidation.invalidations[key] = change.cursor;
      } else {
        readingValidation = { generation: verificationGeneration, invalidations: {} };
      }
    }
    if (!change.courseId && (change.kind === "access" || change.kind === "course")) {
      if (change.kind === "access" && change.action === "delete") {
        courses.clear();
        continue;
      }
      for (const [courseId, course] of courses) {
        if (course.manifest && compareCursor(change.cursor, course.manifest.cursor) >= 0) {
          courses.set(courseId, { ...course, manifest: undefined });
        }
      }
    } else if (change.courseId) {
      const course = courses.get(change.courseId);
      if (!course) continue;
      const manifest = course.manifest;
      if (manifest && compareCursor(change.cursor, manifest.cursor) < 0) continue;
      if (change.kind === "course" || change.kind === "access" || change.kind === "course_outline") {
        if (change.kind !== "course_outline" && change.action === "delete") courses.delete(course.courseId);
        else courses.set(course.courseId, { ...course, manifest: undefined });
      } else if (manifest && (change.kind === "article" || change.kind === "diktat") && change.resourceId) {
        courses.set(course.courseId, { ...course, manifest: {
          ...manifest,
          checkedAt: null,
          materials: manifest.materials.filter(resource => resource.kind !== change.kind || resource.id !== change.resourceId),
        } });
      }
    }
  }
  if (Object.keys(readingValidation.invalidations).length > maxReadingInvalidations) {
    // Fall back to a new verification generation to keep persisted invalidations bounded.
    readingValidation = { generation: verificationGeneration, invalidations: {} };
  }

  for (const [id, grant] of grants) {
    if (!grant.allowed || grant.leaseExpiresAt <= response.serverTime) {
      courses.delete(id);
      continue;
    }
    const old = courses.get(id);
    const enrollment = enrollments.get(id);
    const leaseExpiresAt = Math.min(response.leaseExpiresAt, grant.leaseExpiresAt, enrollment?.expiresAt ?? Infinity);
    if (leaseExpiresAt <= response.serverTime) {
      courses.delete(id);
      continue;
    }
    const narrowed = old && ((old.fullContent && !grant.fullContent) || old.chapterIds.some(chapter => !grant.chapterIds.includes(chapter)));
    const manifest = old?.manifest && {
      ...old.manifest,
      checkedAt: narrowed ? null : old.manifest.checkedAt,
      leaseExpiresAt: Math.min(old.manifest.leaseExpiresAt, leaseExpiresAt),
      materials: old.manifest.materials.filter(resource => allowedChapters(grant, resource)),
    };
    courses.set(id, { courseId: id, allowed: true, fullContent: grant.fullContent, chapterIds: [...grant.chapterIds],
      leaseExpiresAt, title: enrollment?.title ?? old?.title ?? id,
      grantRevision: previousGrantRevisions.get(id) ?? nextRevision, manifest });
  }

  const authorized = [...courses.values()];
  // Keep freshly checked courses ahead of scopes omitted by the bounded sync request.
  authorized.sort((a, b) => Number(grants.has(b.courseId)) - Number(grants.has(a.courseId)));
  return { sessionId: response.sessionId, cursor: previous?.cursor ?? null, lastVerifiedAt: response.serverTime,
    leaseExpiresAt: response.leaseExpiresAt, activeCheckIntervalMs: response.policy.activeCheckIntervalMs,
    metadataMaxAgeMs: response.policy.metadataMaxAgeMs,
    catalogs: response.reset ? undefined : usableCatalogs((previous?.catalogs ?? []).filter(catalog => !invalidatedCatalog(catalog, response)),
      authorized, response.serverTime),
    readingPolicy: { maxBytes: response.policy.maxBytes, maxEntries: response.policy.maxEntries, retentionMs: response.policy.retentionMs,
      contentMaxAgeMs: response.policy.contentMaxAgeMs },
    readingValidation,
    pending: { cursor: response.cursor, reset: response.reset },
    courses: authorized.slice(0, NATIVE_OFFLINE_COURSE_LIMIT) };
}

function reconcileManifest(scope: NativeOfflineScope, response: NativeOfflineSyncResponse,
  course: StoredCourse | undefined, manifest: NativeOfflineManifestResponse): StoredCourse {
  requireIdentity(scope, manifest);
  if (!course || !manifest.resource.allowed || !response.access.some(grant => grant.courseId === course.courseId && grant.allowed)
    || compareCursor(manifest.cursor, response.cursor) < 0
    || (course.manifest && compareCursor(manifest.cursor, course.manifest.cursor) < 0)
    || manifest.resources.length > NATIVE_OFFLINE_MANIFEST_ENTRY_LIMIT) throw new Error("Offline manifest is stale or unauthorized.");
  const chapterIds = course.chapterIds.filter(chapter => manifest.resource.chapterIds.includes(chapter));
  const fullContent = course.fullContent && manifest.resource.fullContent;
  const leaseExpiresAt = Math.min(response.leaseExpiresAt, course.leaseExpiresAt, manifest.leaseExpiresAt, manifest.resource.leaseExpiresAt);
  const narrowed = { ...course, fullContent, chapterIds, leaseExpiresAt };
  const seen = new Set<string>();
  const materials: NativeOfflineResourceDescriptor[] = [];
  for (const material of manifest.resources) {
    const { key, kind, id, courseId, chapterIds, title, revision, updatedAt, estimatedBytes } = material;
    if ((kind !== "article" && kind !== "diktat") || courseId !== course.courseId
      || key !== JSON.stringify([kind, courseId, id]) || seen.has(key) || !allowedChapters(manifest.resource, material)) {
      throw new Error("Offline reading descriptor is invalid.");
    }
    seen.add(key);
    if (allowedChapters(narrowed, material)) materials.push({ key, kind, id, courseId, chapterIds: [...chapterIds], title, revision, updatedAt, estimatedBytes });
  }
  return { ...narrowed, manifest: { cursor: manifest.cursor, checkedAt: manifest.serverTime, leaseExpiresAt, materials } };
}

function encodeSnapshot(snapshot: StoredSnapshot, limit: number): string | null {
  const encoded = JSON.stringify(snapshot);
  return new TextEncoder().encode(encoded).byteLength <= limit ? encoded : null;
}

export async function prepareOfflineReadingAccess(
  db: Pick<OfflineMetadataDatabase, "getFirstAsync">,
  scope: NativeOfflineScope,
  { expectedCursor, expectedRevision, reapply = false, response }: OfflineMetadataAccessPage,
) {
  requireIdentity(scope, response);
  const row = await readAuthorityRow(db, scope);
  const revision = row?.revision ?? 0;
  if (expectedRevision !== undefined && revision !== expectedRevision) return null;
  const stored = readSnapshot(row);
  const previous = stored?.sessionId === scope.sessionId ? stored : null;
  const pending = previous?.pending;
  if ((previous?.cursor ?? null) !== expectedCursor || response.serverTime < (previous?.lastVerifiedAt ?? 0)
    || (!response.reset && (expectedCursor === null
      || compareCursor(response.cursor, expectedCursor) < 0
      || (pending && compareCursor(response.cursor, pending.cursor) < 0)))) return null;
  const updated = applyPageAccess(previous, response, revision + 1, reapply);
  const encoded = encodeSnapshot(updated, maxMetadataBytes)
    ?? encodeSnapshot({ ...updated, catalogs: undefined }, maxMetadataBytes)
    ?? encodeSnapshot({ ...updated, catalogs: undefined, courses: updated.courses.map(course => ({ ...course, manifest: undefined })) }, maxMetadataBytes)
    ?? JSON.stringify({ ...updated, catalogs: undefined, courses: [] });
  return { revision, encoded, previous };
}

export type OfflineMetadataCompletePage = MetadataPage & {
  manifests: readonly NativeOfflineManifestResponse[];
  accessRevision: number;
};

export async function prepareOfflineReadingPage(
  db: Pick<OfflineMetadataDatabase, "getFirstAsync">,
  scope: NativeOfflineScope,
  { expectedCursor, response, manifests, accessRevision }: OfflineMetadataCompletePage,
) {
  requireIdentity(scope, response);
  const row = await readAuthorityRow(db, scope);
  const current = readSnapshot(row);
  if (!current || current.sessionId !== scope.sessionId || row?.revision !== accessRevision || current.cursor !== expectedCursor
    || current.pending?.cursor !== response.cursor || current.pending.reset !== response.reset
    || current.lastVerifiedAt !== response.serverTime) return null;
  const courses = new Map(current.courses.map(course => [course.courseId, course]));
  const reconciled = new Set<string>();
  for (const manifest of manifests) {
    const id = manifest.resource.courseId;
    if (reconciled.has(id)) throw new Error("Duplicate offline manifest.");
    reconciled.add(id);
    courses.set(id, { ...reconcileManifest(scope, response, courses.get(id), manifest), grantRevision: accessRevision + 1 });
  }
  const complete = { ...current, cursor: response.cursor, pending: undefined, courses: [...courses.values()] };
  const limit = Math.min(maxMetadataBytes, Math.floor(response.policy.maxBytes / 4));
  const encoded = encodeSnapshot(complete, limit) ?? encodeSnapshot({ ...complete, catalogs: undefined }, limit);
  if (!encoded) throw new Error("Offline metadata storage limit exceeded.");
  return encoded;
}

export async function writeOfflineReadingSnapshot(db: Pick<OfflineMetadataDatabase, "runAsync">,
  scope: NativeOfflineScope, revision: number, snapshot: string) {
  // One compare-and-swap commits both metadata and its cursor, across SQLite connections.
  const { changes } = await db.runAsync(`
    INSERT INTO offline_reading_metadata_v1 (origin, account_id, locale, session_id, revision, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (origin, account_id, locale) DO UPDATE SET
      session_id = excluded.session_id, revision = excluded.revision, snapshot = excluded.snapshot
    WHERE offline_reading_metadata_v1.revision = ?
  `, ...metadataKeys(scope), scope.sessionId, revision + 1, snapshot, revision);
  return changes === 1;
}

/** Retire work started before a local download clear without discarding the authorized catalog. */
export async function retireOfflineReadingDownloads(tx: Pick<OfflineMetadataDatabase, "getFirstAsync" | "runAsync">,
  scope: NativeOfflineScope, assertCurrent: WriterGuard) {
  const row = await readAuthorityRow(tx, scope);
  const snapshot = readSnapshot(row);
  if (!row || snapshot?.sessionId !== scope.sessionId || !snapshot.readingValidation) return;
  assertCurrent();
  const next = { ...snapshot, readingValidation: { ...snapshot.readingValidation, generation: row.revision + 1 } };
  if (!await writeOfflineReadingSnapshot(tx, scope, row.revision, JSON.stringify(next))) {
    throw new Error("Offline reading authority changed.");
  }
}

export function createOfflineMetadataStore(db: OfflineMetadataDatabase) {
  let ready: Promise<void> | undefined;
  function initialize() {
    ready ??= db.execAsync(offlineMetadataSchema).catch(error => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  async function load(scope: NativeOfflineScope) {
    await initialize();
    return readAuthorityRow(db, scope);
  }

  async function save(scope: NativeOfflineScope, revision: number, snapshot: string, assertCurrent?: WriterGuard) {
    assertCurrent?.();
    const changed = await writeOfflineReadingSnapshot(db, scope, revision, snapshot);
    try {
      assertCurrent?.();
    } catch (error) {
      // Native SQL can finish while the session changes. Do not purge a newer writer's revision.
      if (changed) {
        await db.runAsync(`
          UPDATE offline_reading_metadata_v1 SET snapshot = NULL, revision = revision + 1
          WHERE origin = ? AND account_id = ? AND locale = ? AND session_id = ? AND revision = ?
        `, ...metadataKeys(scope), scope.sessionId, revision + 1);
        notifyOfflineReadingChanges();
      }
      throw error;
    }
    if (changed) notifyOfflineReadingChanges();
    return changed;
  }

  return {
    async accessRevision(scope: NativeOfflineScope): Promise<number> {
      await initialize();
      const row = await db.getFirstAsync<Pick<RawRow, "revision">>(
        "SELECT revision FROM offline_reading_metadata_v1 WHERE origin = ? AND account_id = ? AND locale = ?",
        ...metadataKeys(scope),
      );
      return row?.revision ?? 0;
    },

    async read(scope: NativeOfflineScope, now = Date.now()): Promise<NativeOfflineMetadataSnapshot | null> {
      const snapshot = readSnapshot(await load(scope));
      if (!snapshot || snapshot.sessionId !== scope.sessionId) return null;
      return { cursor: snapshot.cursor, knownCourseIds: snapshot.courses.map(course => course.courseId),
        activeCheckIntervalMs: snapshot.activeCheckIntervalMs, metadataMaxAgeMs: snapshot.metadataMaxAgeMs,
        catalogs: snapshot.leaseExpiresAt > now ? usableCatalogs(snapshot.catalogs ?? [], snapshot.courses, now) : [],
        courses: snapshot.courses.filter(course => Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt) > now).map(course => {
          const { manifest } = course;
          const useManifest = manifest && Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt, manifest.leaseExpiresAt) > now;
          return { id: course.courseId, title: course.title, catalogGrant: catalogGrant(course), leaseExpiresAt: Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt),
            manifestCheckedAt: useManifest ? manifest.checkedAt ?? undefined : undefined,
            manifestLeaseExpiresAt: useManifest ? manifest.leaseExpiresAt : undefined,
            materials: useManifest ? manifest.materials : [] };
        }) };
    },

    async saveCatalogs(scope: NativeOfflineScope, expectedRevision: number, latest: readonly OfflineLibraryCatalog[],
      denied: readonly OfflineCatalogTarget[], assertCurrent: WriterGuard, now = Date.now()) {
      const row = await load(scope);
      const snapshot = readSnapshot(row);
      if (!row || row.revision !== expectedRevision || !snapshot?.cursor || snapshot.sessionId !== scope.sessionId ||
        snapshot.pending || snapshot.leaseExpiresAt <= now) return false;
      const retained = usableCatalogs(snapshot.catalogs ?? [], snapshot.courses, now).filter(catalog =>
        !denied.some(target => catalog.kind === target.kind && catalog.courseId === target.courseId));
      const refreshed = usableCatalogs(latest.filter(catalog => compareCursor(catalog.cursor, snapshot.cursor!) >= 0), snapshot.courses, now);
      const catalogKey = (catalog: OfflineLibraryCatalog) => JSON.stringify([catalog.kind, catalog.courseId]);
      const catalogs = new Map(retained.map(catalog => [catalogKey(catalog), catalog]));
      for (const catalog of refreshed) {
        const prior = catalogs.get(catalogKey(catalog));
        if (!prior || compareCursor(prior.cursor, catalog.cursor) <= 0) catalogs.set(catalogKey(catalog), catalog);
      }
      const withinBudget: OfflineLibraryCatalog[] = [];
      let bytes = 0;
      for (const catalog of [...catalogs.values()].sort((a, b) => Number(b.kind === "achievement_catalog") - Number(a.kind === "achievement_catalog"))) {
        const size = new TextEncoder().encode(JSON.stringify(catalog)).byteLength;
        if (bytes + size > maxCatalogBytes) continue;
        bytes += size;
        withinBudget.push(catalog);
      }
      const encoded = encodeSnapshot({ ...snapshot, catalogs: withinBudget }, maxMetadataBytes);
      return encoded !== null && save(scope, row.revision, encoded, assertCurrent);
    },

    async applyAccess(scope: NativeOfflineScope, page: OfflineMetadataAccessPage, assertCurrent?: WriterGuard): Promise<number | null> {
      await initialize();
      const update = await prepareOfflineReadingAccess(db, scope, page);
      return update && await save(scope, update.revision, update.encoded, assertCurrent) ? update.revision + 1 : null;
    },

    async commitPage(scope: NativeOfflineScope, page: OfflineMetadataCompletePage, assertCurrent?: WriterGuard): Promise<boolean> {
      await initialize();
      const encoded = await prepareOfflineReadingPage(db, scope, page);
      return encoded !== null && save(scope, page.accessRevision, encoded, assertCurrent);
    },

    async clear(scope: NativeOfflineScope, assertCurrent?: WriterGuard): Promise<boolean> {
      await initialize();
      assertCurrent?.();
      // Preserve the revision across a purge so a late write cannot recreate its old snapshot.
      const { changes } = await db.runAsync(`
        INSERT INTO offline_reading_metadata_v1 (origin, account_id, locale, session_id, revision, snapshot)
        VALUES (?, ?, ?, ?, 1, NULL)
        ON CONFLICT (origin, account_id, locale) DO UPDATE SET
          snapshot = NULL, revision = offline_reading_metadata_v1.revision + 1
        WHERE offline_reading_metadata_v1.session_id = excluded.session_id
      `, ...metadataKeys(scope), scope.sessionId);
      if (changes === 1) notifyOfflineReadingChanges();
      return changes === 1;
    },

    async clearSession({ origin, accountId, sessionId }: NativeSessionScope): Promise<void> {
      await initialize();
      await db.runAsync(`
        INSERT INTO offline_reading_metadata_v1 (origin, account_id, locale, session_id, revision, snapshot)
        VALUES (?, ?, 'id', ?, 1, NULL), (?, ?, 'en', ?, 1, NULL)
        ON CONFLICT (origin, account_id, locale) DO UPDATE SET
          snapshot = NULL, revision = offline_reading_metadata_v1.revision + 1
        WHERE offline_reading_metadata_v1.session_id = excluded.session_id
      `, origin, accountId, sessionId, origin, accountId, sessionId);
      notifyOfflineReadingChanges();
    },
  };
}

export type NativeOfflineMetadataStore = ReturnType<typeof createOfflineMetadataStore>;
