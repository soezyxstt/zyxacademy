import {
  compareNativeOfflineCursors as compareCursor,
  isNativeOfflineCursor,
  NATIVE_OFFLINE_COURSE_LIMIT,
  type NativeOfflineCourseAccess,
  type NativeOfflineManifestResponse,
  type NativeOfflineResourceDescriptor,
  type NativeOfflineScope,
  type NativeOfflineSyncResponse,
} from "./sync-contract";
import type { NativeSessionScope } from "../network/transport";
import type { OfflinePolicy } from "../../../lib/offline/policy-types";
import { notifyOfflineReadingChanges } from "./reading-events";

// These storage bounds mirror lib/offline/metadata-cache.ts and sync-contract.ts.
const maxManifestEntries = 10_000;
const maxMetadataBytes = 8 * 1024 * 1024;
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
type StoredCourse = NativeOfflineCourseAccess & { title: string; manifest?: StoredManifest };
type StoredSnapshot = {
  sessionId: string;
  cursor: string | null;
  lastVerifiedAt: number;
  leaseExpiresAt: number;
  activeCheckIntervalMs?: number;
  readingPolicy?: Pick<OfflinePolicy, "maxBytes" | "maxEntries" | "retentionMs">;
  pending?: { cursor: string; reset: boolean };
  courses: StoredCourse[];
};
type RawRow = { revision: number; session_id: string; snapshot: string | null };
type MetadataPage = { expectedCursor: string | null; response: NativeOfflineSyncResponse };
type WriterGuard = () => void;

export type NativeOfflineMetadataSnapshot = {
  cursor: string | null;
  knownCourseIds: string[];
  activeCheckIntervalMs?: number;
  courses: Array<{
    id: string;
    title: string;
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

export async function readOfflineReadingAuthority(db: Pick<OfflineMetadataDatabase, "getFirstAsync">, scope: NativeOfflineScope) {
  const row = await db.getFirstAsync<RawRow>(
    "SELECT revision, session_id, snapshot FROM offline_reading_metadata_v1 WHERE origin = ? AND account_id = ? AND locale = ?",
    scope.origin, scope.accountId, scope.locale,
  );
  const snapshot = readSnapshot(row);
  return snapshot && snapshot.sessionId === scope.sessionId ? snapshot : null;
}

function allowedChapters(grant: NativeOfflineCourseAccess, resource: NativeOfflineResourceDescriptor) {
  // Keep the same conservative chapter proof as lib/offline/sync-client.ts.
  return grant.allowed && resource.chapterIds.length > 0
    && resource.chapterIds.every(chapter => grant.chapterIds.includes(chapter));
}

function applyPageAccess(previous: StoredSnapshot | null, response: NativeOfflineSyncResponse): StoredSnapshot {
  const courses = new Map((response.reset ? [] : previous?.courses ?? []).map(course => [course.courseId, course]));
  const enrollments = new Map(response.enrollments.map(course => [course.id, course]));
  const grants = new Map(response.access.map(grant => [grant.courseId, grant]));
  for (const change of response.changes) {
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
      leaseExpiresAt, title: enrollment?.title ?? old?.title ?? id, manifest });
  }

  const authorized = [...courses.values()];
  // Keep freshly checked courses ahead of scopes omitted by the bounded sync request.
  authorized.sort((a, b) => Number(grants.has(b.courseId)) - Number(grants.has(a.courseId)));
  return { sessionId: response.sessionId, cursor: previous?.cursor ?? null, lastVerifiedAt: response.serverTime,
    leaseExpiresAt: response.leaseExpiresAt, activeCheckIntervalMs: response.policy.activeCheckIntervalMs,
    readingPolicy: { maxBytes: response.policy.maxBytes, maxEntries: response.policy.maxEntries, retentionMs: response.policy.retentionMs },
    pending: { cursor: response.cursor, reset: response.reset },
    courses: authorized.slice(0, NATIVE_OFFLINE_COURSE_LIMIT) };
}

function reconcileManifest(scope: NativeOfflineScope, response: NativeOfflineSyncResponse,
  course: StoredCourse | undefined, manifest: NativeOfflineManifestResponse): StoredCourse {
  requireIdentity(scope, manifest);
  if (!course || !manifest.resource.allowed || !response.access.some(grant => grant.courseId === course.courseId && grant.allowed)
    || compareCursor(manifest.cursor, response.cursor) < 0
    || (course.manifest && compareCursor(manifest.cursor, course.manifest.cursor) < 0)
    || manifest.resources.length > maxManifestEntries) throw new Error("Offline manifest is stale or unauthorized.");
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

export function createOfflineMetadataStore(db: OfflineMetadataDatabase) {
  let ready: Promise<void> | undefined;
  const keys = (scope: NativeOfflineScope) => [scope.origin, scope.accountId, scope.locale] as const;
  function initialize() {
    ready ??= db.execAsync(offlineMetadataSchema).catch(error => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  async function load(scope: NativeOfflineScope) {
    await initialize();
    return db.getFirstAsync<RawRow>(
      "SELECT revision, session_id, snapshot FROM offline_reading_metadata_v1 WHERE origin = ? AND account_id = ? AND locale = ?",
      ...keys(scope),
    );
  }

  async function save(scope: NativeOfflineScope, revision: number, snapshot: string, assertCurrent?: WriterGuard) {
    assertCurrent?.();
    // One compare-and-swap commits both metadata and its cursor, across SQLite connections.
    const { changes } = await db.runAsync(`
      INSERT INTO offline_reading_metadata_v1 (origin, account_id, locale, session_id, revision, snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (origin, account_id, locale) DO UPDATE SET
        session_id = excluded.session_id, revision = excluded.revision, snapshot = excluded.snapshot
      WHERE offline_reading_metadata_v1.revision = ?
    `, ...keys(scope), scope.sessionId, revision + 1, snapshot, revision);
    try {
      assertCurrent?.();
    } catch (error) {
      // Native SQL can finish while the session changes. Do not purge a newer writer's revision.
      if (changes === 1) {
        await db.runAsync(`
          UPDATE offline_reading_metadata_v1 SET snapshot = NULL, revision = revision + 1
          WHERE origin = ? AND account_id = ? AND locale = ? AND session_id = ? AND revision = ?
        `, ...keys(scope), scope.sessionId, revision + 1);
        notifyOfflineReadingChanges();
      }
      throw error;
    }
    if (changes === 1) notifyOfflineReadingChanges();
    return changes === 1;
  }

  return {
    async read(scope: NativeOfflineScope, now = Date.now()): Promise<NativeOfflineMetadataSnapshot | null> {
      const snapshot = readSnapshot(await load(scope));
      if (!snapshot || snapshot.sessionId !== scope.sessionId) return null;
      return { cursor: snapshot.cursor, knownCourseIds: snapshot.courses.map(course => course.courseId),
        activeCheckIntervalMs: snapshot.activeCheckIntervalMs,
        courses: snapshot.courses.filter(course => Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt) > now).map(course => {
          const { manifest } = course;
          const useManifest = manifest && Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt, manifest.leaseExpiresAt) > now;
          return { id: course.courseId, title: course.title, leaseExpiresAt: Math.min(course.leaseExpiresAt, snapshot.leaseExpiresAt),
            manifestCheckedAt: useManifest ? manifest.checkedAt ?? undefined : undefined,
            manifestLeaseExpiresAt: useManifest ? manifest.leaseExpiresAt : undefined,
            materials: useManifest ? manifest.materials : [] };
        }) };
    },

    async applyAccess(scope: NativeOfflineScope, { expectedCursor, response }: MetadataPage, assertCurrent?: WriterGuard): Promise<number | null> {
      requireIdentity(scope, response);
      const row = await load(scope);
      const stored = readSnapshot(row);
      const previous = stored?.sessionId === scope.sessionId ? stored : null;
      const pending = previous?.pending;
      if ((previous?.cursor ?? null) !== expectedCursor || response.serverTime < (previous?.lastVerifiedAt ?? 0)
        || (!response.reset && (expectedCursor === null
          || compareCursor(response.cursor, expectedCursor) < 0
          || (pending && compareCursor(response.cursor, pending.cursor) < 0)))) return null;
      const revision = row?.revision ?? 0;
      // Always apply access revocations before fetching any replacements, even if a new policy cuts the quota.
      const updated = applyPageAccess(previous, response);
      const encoded = encodeSnapshot(updated, maxMetadataBytes)
        ?? encodeSnapshot({ ...updated, courses: updated.courses.map(course => ({ ...course, manifest: undefined })) }, maxMetadataBytes)
        ?? JSON.stringify({ ...updated, courses: [] });
      if (await save(scope, revision, encoded, assertCurrent)) return revision + 1;
      return null;
    },

    async commitPage(scope: NativeOfflineScope, { expectedCursor, response, manifests, accessRevision }: MetadataPage & {
      manifests: readonly NativeOfflineManifestResponse[];
      accessRevision: number;
    }, assertCurrent?: WriterGuard): Promise<boolean> {
      requireIdentity(scope, response);
      const row = await load(scope);
      const current = readSnapshot(row);
      if (!current || current.sessionId !== scope.sessionId || row?.revision !== accessRevision || current.cursor !== expectedCursor
        || current.pending?.cursor !== response.cursor || current.pending.reset !== response.reset
        || current.lastVerifiedAt !== response.serverTime) return false;
      const courses = new Map(current.courses.map(course => [course.courseId, course]));
      const reconciled = new Set<string>();
      for (const manifest of manifests) {
        const id = manifest.resource.courseId;
        if (reconciled.has(id)) throw new Error("Duplicate offline manifest.");
        reconciled.add(id);
        courses.set(id, reconcileManifest(scope, response, courses.get(id), manifest));
      }
      const complete = { ...current, cursor: response.cursor, pending: undefined, courses: [...courses.values()] };
      const encoded = encodeSnapshot(complete, Math.min(maxMetadataBytes, Math.floor(response.policy.maxBytes / 4)));
      if (!encoded) throw new Error("Offline metadata storage limit exceeded.");
      return save(scope, accessRevision, encoded, assertCurrent);
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
      `, ...keys(scope), scope.sessionId);
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
