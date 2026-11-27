import type { NativeSessionScope } from "../network/transport";
import {
  offlineMetadataSchema,
  equivalentOfflineCourseAccess,
  prepareOfflineReadingAccess,
  prepareOfflineReadingPage,
  readOfflineReadingAuthorities,
  readOfflineReadingAuthority,
  readOfflineReadingAuthorityVersions,
  retireOfflineReadingDownloads,
  restrictOfflineReadingAuthority,
  withdrawOfflineReadingCourses,
  writeOfflineReadingSnapshot,
  type OfflineReadingCourseVersion,
  type OfflineMetadataAccessPage,
  type OfflineMetadataCompletePage,
  type OfflineReadingRemoval,
  type OfflineReadingRestrictions,
} from "./metadata-store";
import {
  OfflineReadingError,
  READING_ASSET_COUNT_LIMIT,
  READING_ASSET_LIMIT,
  READING_BODY_LIMIT,
  READING_ENTRY_LIMIT,
  READING_PACKAGE_LIMIT,
  READING_STORAGE_LIMIT,
  readingKey,
  type OfflineReadingAsset,
  type OfflineReadingData,
  type OfflineReadingPackage,
  type OfflineReadingSummary,
  type OfflineReadingTarget,
} from "./reading-contract";
import { notifyOfflineReadingChanges } from "./reading-events";
import { compareNativeOfflineCursors, isNativeOfflineCursor, type NativeOfflineManifestResponse, type NativeOfflineScope } from "./sync-contract";

const CHUNK_BYTES = 256 * 1024;
const INFO_BYTES = 384 * 1024;
const DEVICE_BYTES = 2 * READING_STORAGE_LIMIT;
const visitLimit = 1000;
const schema = `
  DROP TABLE IF EXISTS expo_reading_packages_v1;
  DROP TABLE IF EXISTS expo_reading_parts_v1;
  DROP TABLE IF EXISTS expo_reading_verification_v1;
  CREATE TABLE IF NOT EXISTS expo_reading_packages_v2 (
    entry INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    account_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    course_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    chapter_ids TEXT NOT NULL,
    validated_at INTEGER NOT NULL,
    verified_at INTEGER NOT NULL,
    verified_until INTEGER NOT NULL,
    verified_cursor TEXT NOT NULL,
    reset_generation INTEGER NOT NULL,
    asset_lease_expires_at INTEGER,
    info TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    UNIQUE (origin, account_id, session_id, locale, resource_key)
  );
  CREATE TABLE IF NOT EXISTS expo_reading_parts_v2 (
    entry INTEGER NOT NULL,
    part INTEGER NOT NULL,
    chunk INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (entry, part, chunk)
  );
  CREATE TABLE IF NOT EXISTS expo_reading_visits (
    origin TEXT NOT NULL,
    account_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    newest_visit TEXT NOT NULL,
    prior_visit TEXT,
    opened_at INTEGER NOT NULL,
    PRIMARY KEY (origin, account_id, session_id, locale, resource_key)
  );
  CREATE TABLE IF NOT EXISTS expo_reading_unpinned_v2 (
    entry INTEGER PRIMARY KEY
  );
  CREATE TRIGGER IF NOT EXISTS expo_reading_unpinned_delete_v2 AFTER DELETE ON expo_reading_packages_v2
    BEGIN
      DELETE FROM expo_reading_unpinned_v2 WHERE entry = OLD.entry;
    END;
  CREATE TRIGGER IF NOT EXISTS expo_reading_package_delete_v2 AFTER DELETE ON expo_reading_packages_v2
    BEGIN
      DELETE FROM expo_reading_parts_v2 WHERE entry = OLD.entry;
    END;
`;
const purgeRetiredScopes = `
  DELETE FROM expo_reading_packages_v2
  WHERE EXISTS (
    SELECT 1 FROM offline_reading_metadata_v1 AS authority
    WHERE authority.origin = expo_reading_packages_v2.origin
      AND authority.account_id = expo_reading_packages_v2.account_id
      AND authority.locale = expo_reading_packages_v2.locale
      AND (authority.session_id <> expo_reading_packages_v2.session_id OR authority.snapshot IS NULL)
  )
`;

type Bind = string | number | null | Uint8Array;
type Connection = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Bind[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
};
export type OfflineReadingDatabase = Connection & {
  withExclusiveTransactionAsync(work: (tx: Connection) => Promise<void>): Promise<void>;
};

type Authority = NonNullable<Awaited<ReturnType<typeof readOfflineReadingAuthority>>>;
type Guard = { verifiedUntil: number; assertCurrent(): void };
type EntryRow = {
  entry: number; resource_key: string; course_id: string; revision: string; chapter_ids: string;
  validated_at: number; bytes: number; saved_at: number; pinned: number;
  verified_at: number; verified_until: number; verified_cursor: string;
  reset_generation: number; asset_lease_expires_at: number | null;
};
type SavedVersion = Pick<EntryRow, "entry" | "revision" | "verified_at" | "verified_until" | "verified_cursor" | "reset_generation">;
export type OfflineReadingRequestVersion = {
  saved: SavedVersion;
  cursor: string;
  checkedAt: number | null;
  generation: number;
};
type EntryInfo = {
  bodyBytes: number;
  assets: Array<{ url: string; mime: string; size: number }>;
};
export type OfflineManifestCheck = {
  accepted: NativeOfflineManifestResponse;
  reported: NativeOfflineManifestResponse;
  versions: readonly OfflineReadingCourseVersion[];
};

export type ReadingCandidate = {
  target: OfflineReadingTarget;
  pinned?: boolean;
  revision: string;
  cursor: string;
  resetGeneration: number;
  leaseExpiresAt: number;
  assetLeaseExpiresAt: number | null;
  validatedAt: number;
  requiredEntry?: number;
  body: Uint8Array;
  assets: OfflineReadingAsset[];
};

const keys = (scope: NativeOfflineScope) => [scope.origin, scope.accountId, scope.sessionId, scope.locale] as const;
const scopeFilter = "origin = ? AND account_id = ? AND session_id = ? AND locale = ?";
const entryColumns = `entry, resource_key, course_id, revision, chapter_ids, validated_at, bytes, saved_at,
  verified_at, verified_until, verified_cursor, reset_generation, asset_lease_expires_at,
  NOT EXISTS (SELECT 1 FROM expo_reading_unpinned_v2 WHERE entry = expo_reading_packages_v2.entry) AS pinned`;
const readColumns = `SELECT ${entryColumns} FROM expo_reading_packages_v2`;

function entryTarget(key: string): OfflineReadingTarget | null {
  try {
    const [kind, courseId, id] = JSON.parse(key);
    const target = { kind, courseId, id };
    return readingKey(target) === key ? target : null;
  } catch { return null; }
}

function decodeChapterIds(value: string): string[] {
  try {
    const chapters = JSON.parse(value);
    if (Array.isArray(chapters) && chapters.every(chapter => typeof chapter === "string")) return chapters;
  } catch { /* A damaged row supplies no proof. */ }
  return [];
}

function decodeInfo(entry: EntryRow & { info: string }): EntryInfo | null {
  try {
    const info = JSON.parse(entry.info) as EntryInfo;
    if (!Array.isArray(info.assets) || info.assets.length > READING_ASSET_COUNT_LIMIT
      || !Number.isSafeInteger(info.bodyBytes) || info.bodyBytes <= 0 || info.bodyBytes > READING_BODY_LIMIT
      || !info.assets.every(asset => Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= READING_ASSET_LIMIT)
      || info.bodyBytes + info.assets.reduce((sum, asset) => sum + asset.size, 0) > entry.bytes) return null;
    return info;
  } catch { return null; }
}

function activeCourse(authority: Authority, courseId: string, cutoff: number) {
  const course = authority.courses.find(item => item.courseId === courseId);
  return course && course.allowed && Math.min(authority.leaseExpiresAt, course.leaseExpiresAt) > cutoff ? course : null;
}

function proof(authority: Authority, target: OfflineReadingTarget, cutoff: number) {
  const validation = authority.readingValidation;
  if (!validation || authority.pending?.reset || !authority.readingPolicy?.contentMaxAgeMs) return null;
  const course = activeCourse(authority, target.courseId, cutoff);
  if (!course?.manifest || course.manifest.leaseExpiresAt <= cutoff) return null;
  const { manifest } = course;
  const descriptor = manifest.materials.find(item => item.key === readingKey(target));
  if (!descriptor || !descriptor.chapterIds.length || !descriptor.chapterIds.every(chapter => course.chapterIds.includes(chapter))) return null;
  const leaseExpiresAt = Math.min(authority.leaseExpiresAt, course.leaseExpiresAt, manifest.leaseExpiresAt);
  const invalidation = validation.invalidations[descriptor.key];
  const cursor = invalidation && compareNativeOfflineCursors(invalidation, manifest.cursor) > 0 ? invalidation : manifest.cursor;
  return { descriptor, cursor, manifestCursor: manifest.cursor, checkedAt: manifest.checkedAt, leaseExpiresAt,
    resetGeneration: validation.generation, invalidation };
}

function verifiedEntry(authority: Authority, entry: EntryRow, access: NonNullable<ReturnType<typeof proof>>, verifiedUntil: number, now: number) {
  const policy = authority.readingPolicy;
  const { verified_at: verifiedAt, verified_until: packageLease, verified_cursor: cursor } = entry;
  if (!policy || access.descriptor.revision !== entry.revision || entry.reset_generation !== access.resetGeneration
    || !isNativeOfflineCursor(cursor) || !Number.isSafeInteger(verifiedAt) || !Number.isSafeInteger(packageLease)
    || (access.invalidation && compareNativeOfflineCursors(cursor, access.invalidation) < 0)
    || (access.checkedAt !== null && access.checkedAt > verifiedAt && compareNativeOfflineCursors(access.manifestCursor, cursor) < 0)) return null;
  const lease = Math.min(verifiedUntil, access.leaseExpiresAt, entry.pinned ? Infinity : entry.saved_at + policy.retentionMs,
    verifiedAt + policy.contentMaxAgeMs, packageLease, entry.asset_lease_expires_at ?? Infinity);
  return Number.isFinite(lease) && lease > now ? lease : null;
}

function readyEntry(authority: Authority, entry: EntryRow, verifiedUntil: number, now: number): OfflineReadingSummary | null {
  const target = entryTarget(entry.resource_key);
  if (!target || entry.bytes < 1 || entry.bytes > READING_PACKAGE_LIMIT) return null;
  const access = proof(authority, target, now);
  const leaseExpiresAt = access && verifiedEntry(authority, entry, access, verifiedUntil, now);
  if (!leaseExpiresAt) return null;
  return { ...target, key: entry.resource_key, title: access.descriptor.title,
    revision: entry.revision, bytes: entry.bytes, savedAt: entry.saved_at, leaseExpiresAt, pinned: Boolean(entry.pinned) };
}

export function createOfflineReadingStore(db: OfflineReadingDatabase, now = Date.now) {
  let ready: Promise<void> | undefined;
  let writer: Promise<unknown> = Promise.resolve();
  async function exclusive<T>(work: (tx: Connection) => Promise<T>): Promise<T> {
    let value: T | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        await db.withExclusiveTransactionAsync(async tx => {
          await tx.execAsync("PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON");
          value = await work(tx);
        });
        return value as T;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (attempt >= 5 || !/SQLITE_BUSY|database is locked|database table is locked/i.test(message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
  function initialize() {
    // A downgraded client can recreate the old tables, so clear them on every new repository open.
    ready ??= exclusive(async tx => {
      await tx.execAsync(offlineMetadataSchema + schema);
      // Older builds clear authority but have no access to the v2 package tables.
      await tx.runAsync(purgeRetiredScopes);
    }).catch(error => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  function transaction<T>(work: (tx: Connection) => Promise<T>): Promise<T> {
    const run = async () => {
      await initialize();
      return exclusive(work);
    };
    const pending = writer.then(run, run);
    writer = pending;
    return pending;
  }

  function assertGrant(guard: Guard) {
    guard.assertCurrent();
    if (guard.verifiedUntil <= now()) throw new OfflineReadingError("cancelled");
  }

  const rows = (tx: Connection, scope: NativeOfflineScope) => tx.getAllAsync<EntryRow>(
    `${readColumns} WHERE ${scopeFilter} ORDER BY saved_at DESC, entry DESC`, ...keys(scope),
  );
  const savedVersion = (tx: Connection, scope: NativeOfflineScope, target: OfflineReadingTarget) => tx.getFirstAsync<SavedVersion>(
    `SELECT entry, revision, verified_at, verified_until, verified_cursor, reset_generation FROM expo_reading_packages_v2
      WHERE ${scopeFilter} AND resource_key = ?`, ...keys(scope), readingKey(target),
  );
  const entry = (tx: Connection, scope: NativeOfflineScope, target: OfflineReadingTarget) => tx.getFirstAsync<EntryRow & { info: string }>(
    `SELECT ${entryColumns}, info FROM expo_reading_packages_v2 WHERE ${scopeFilter} AND resource_key = ?`,
    ...keys(scope), readingKey(target),
  );

  async function remove(entryId: number, tx: Connection) {
    const { changes } = await tx.runAsync("DELETE FROM expo_reading_packages_v2 WHERE entry = ?", entryId);
    return Number(changes > 0);
  }

  async function removeCourses(tx: Connection, scope: NativeOfflineScope, courseIds: readonly string[]) {
    if (!courseIds.length) return;
    const placeholders = courseIds.map(() => "?").join(", ");
    await tx.runAsync(`DELETE FROM expo_reading_packages_v2 WHERE ${scopeFilter} AND course_id IN (${placeholders})`,
      ...keys(scope), ...courseIds);
  }

  async function removeRestricted(tx: Connection, scope: NativeOfflineScope, removal: OfflineReadingRemoval) {
    await removeCourses(tx, scope, removal.denied);
    if (!removal.chapterLimits.size && !removal.deleted.size && !removal.omitted.size) return;
    for (const row of await rows(tx, scope)) {
      const chapters = removal.chapterLimits.get(row.course_id);
      const omission = removal.omitted.get(row.course_id);
      const deletedAt = removal.deleted.get(row.resource_key) ?? (omission && !omission.keys.has(row.resource_key) ? omission.cursor : undefined);
      if ((chapters && !decodeChapterIds(row.chapter_ids).every(chapter => chapters.includes(chapter)))
        || (deletedAt && compareNativeOfflineCursors(row.verified_cursor, deletedAt) <= 0)) await remove(row.entry, tx);
    }
  }

  async function restrictAlternate(tx: Connection, scope: NativeOfflineScope, restrictions: OfflineReadingRestrictions,
    versions: readonly OfflineReadingCourseVersion[], assertCurrent: () => void) {
    for (const { locale, revision } of versions) {
      if (locale === scope.locale) continue;
      const alternate = { ...scope, locale };
      const removal = await restrictOfflineReadingAuthority(tx, alternate, revision, restrictions, assertCurrent);
      if (removal) await removeRestricted(tx, alternate, removal);
    }
  }

  async function withdrawCourses(tx: Connection, session: NativeSessionScope, courseIds: readonly string[],
    versions: readonly OfflineReadingCourseVersion[], assertCurrent: () => void) {
    let changed = false;
    for (const version of versions) {
      const withdrawn = await withdrawOfflineReadingCourses(tx, session, courseIds, version, assertCurrent);
      if (!withdrawn.length) continue;
      await removeCourses(tx, { ...session, locale: version.locale }, withdrawn);
      changed = true;
    }
    return changed;
  }

  async function inspect(scope: NativeOfflineScope, guard: Guard) {
    assertGrant(guard);
    await initialize();
    const entries = await rows(db, scope);
    // Read current authority after the rows to avoid publishing a package invalidated during the query.
    const authority = await readOfflineReadingAuthority(db, scope);
    assertGrant(guard);
    return { entries, authority };
  }

  function unavailableRows(entries: EntryRow[], authority: Authority | null, guard: Guard) {
    const time = now();
    return entries.filter(row => !authority || !readyEntry(authority, row, guard.verifiedUntil, time));
  }

  async function reconcileScope(tx: Connection, scope: NativeOfflineScope, authority: Authority) {
    let changes = 0;
    for (const row of await rows(tx, scope)) {
      const chapters = decodeChapterIds(row.chapter_ids);
      const course = authority.courses.find(item => item.courseId === row.course_id);
      const withdrawn = course?.manifest && !authority.pending && !course.manifest.materials.some(item => item.key === row.resource_key);
      const expired = !row.pinned && authority.readingPolicy && now() - row.saved_at >= authority.readingPolicy.retentionMs;
      if (!chapters.length || !course?.allowed || !chapters.every(chapter => course.chapterIds.includes(chapter)) || withdrawn || expired) {
        changes += await remove(row.entry, tx);
        continue;
      }
      const target = entryTarget(row.resource_key);
      const access = target && proof(authority, target, now());
      if (!access || access.checkedAt === null || access.checkedAt <= row.verified_at
        || !verifiedEntry(authority, row, access, Infinity, Math.max(now(), access.checkedAt))) continue;
      // Advance only a live verification. Keep the hard lease from the actual required image responses.
      const lease = Math.min(access.leaseExpiresAt, row.asset_lease_expires_at ?? Infinity);
      const result = await tx.runAsync(`
        UPDATE expo_reading_packages_v2
        SET verified_at = ?, verified_until = ?, verified_cursor = ?
        WHERE entry = ?
      `, access.checkedAt, lease, access.manifestCursor, row.entry);
      changes += result.changes;
    }
    return changes;
  }

  async function list(scope: NativeOfflineScope, guard: Guard) {
    const { entries, authority } = await inspect(scope, guard);
    return authority ? entries.flatMap(row => {
      const result = readyEntry(authority, row, guard.verifiedUntil, now());
      return result ? [result] : [];
    }) : [];
  }

  async function read(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard): Promise<OfflineReadingPackage | null> {
    assertGrant(guard);
    await initialize();
    const authority = await readOfflineReadingAuthority(db, scope);
    const row = authority && await entry(db, scope, target);
    const initial = authority && row && readyEntry(authority, row, guard.verifiedUntil, now());
    const info = initial && row && decodeInfo(row);
    if (!row || !info) return null;
    const parts = [new Uint8Array(info.bodyBytes), ...info.assets.map(asset => new Uint8Array(asset.size))];
    const offsets = parts.map(() => 0);
    const chunks = await db.getAllAsync<{ part: number; data: Uint8Array }>(
      "SELECT part, data FROM expo_reading_parts_v2 WHERE entry = ? ORDER BY part, chunk", row.entry,
    );
    for (const { part, data } of chunks) {
      const destination = parts[part];
      if (!destination || offsets[part] + data.byteLength > destination.byteLength) return null;
      destination.set(data, offsets[part]);
      offsets[part] += data.byteLength;
    }
    if (offsets.some((offset, index) => offset !== parts[index].byteLength)) return null;
    const latestRow = await savedVersion(db, scope, target);
    const latest = await readOfflineReadingAuthority(db, scope);
    assertGrant(guard);
    if (!latestRow || latestRow.entry !== row.entry || !latest) return null;
    const current = readyEntry(latest, { ...row, ...latestRow }, guard.verifiedUntil, now());
    if (!current) return null;
    const data = JSON.parse(new TextDecoder().decode(parts[0])) as OfflineReadingData;
    const assets = info.assets.map(({ url, mime }, index) => ({ url, mime, bytes: parts[index + 1] }));
    return { summary: current, data, assets };
  }

  async function store(scope: NativeOfflineScope, candidate: ReadingCandidate, guard: Guard) {
    const key = readingKey(candidate.target);
    const infoBytes = candidate.body.byteLength + candidate.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (infoBytes > READING_PACKAGE_LIMIT) throw new OfflineReadingError("too-large");
    if ((candidate.assets.length > 0 && !Number.isSafeInteger(candidate.assetLeaseExpiresAt))
      || (candidate.assets.length === 0 && candidate.assetLeaseExpiresAt !== null)) throw new OfflineReadingError("changed");
    let committedEntry: number | undefined;
    let reconciled = 0;
    try {
      const committed = await transaction(async tx => {
        assertGrant(guard);
        const authority = await readOfflineReadingAuthority(tx, scope);
        const access = authority && proof(authority, candidate.target, now());
        if (candidate.pinned === false && authority?.readingPolicy?.autoCache !== true) throw new OfflineReadingError("cancelled");
        if (!authority?.readingPolicy || !access || access.descriptor.revision !== candidate.revision
          || access.resetGeneration !== candidate.resetGeneration || !isNativeOfflineCursor(candidate.cursor)
          || compareNativeOfflineCursors(candidate.cursor, access.cursor) < 0
          || Math.min(candidate.leaseExpiresAt, candidate.assetLeaseExpiresAt ?? Infinity, access.leaseExpiresAt) <= now()
          || candidate.validatedAt + authority.readingPolicy.contentMaxAgeMs <= now()) throw new OfflineReadingError("changed");
        if (candidate.requiredEntry !== undefined
          && (await savedVersion(tx, scope, candidate.target))?.entry !== candidate.requiredEntry) throw new OfflineReadingError("cancelled");
        const info = JSON.stringify({
          bodyBytes: candidate.body.byteLength, assets: candidate.assets.map(({ url, mime, bytes }) => ({ url, mime, size: bytes.byteLength })),
        } satisfies EntryInfo);
        const chapters = JSON.stringify(access.descriptor.chapterIds);
        const extra = new TextEncoder().encode(info + chapters).byteLength;
        if (extra > INFO_BYTES) throw new OfflineReadingError("too-large");
        const size = infoBytes + extra;
        if (size > READING_PACKAGE_LIMIT) throw new OfflineReadingError("too-large");
        const changes = await reconcileScope(tx, scope, authority);
        const previous = await entry(tx, scope, candidate.target);
        if (previous?.reset_generation === candidate.resetGeneration
          && (Math.max(previous.validated_at, previous.verified_at) > candidate.validatedAt
            || compareNativeOfflineCursors(candidate.cursor, previous.verified_cursor) < 0)) throw new OfflineReadingError("changed");
        await tx.runAsync(purgeRetiredScopes);
        const existingRows = await rows(tx, scope);
        const device = await tx.getFirstAsync<{ bytes: number }>("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM expo_reading_packages_v2");
        const previousBytes = previous?.bytes ?? 0;
        const maxEntries = Math.min(authority.readingPolicy.maxEntries, READING_ENTRY_LIMIT);
        const maxBytes = Math.min(authority.readingPolicy.maxBytes, READING_STORAGE_LIMIT);
        let count = existingRows.length + Number(!previous);
        let bytes = existingRows.reduce((sum, row) => sum + row.bytes, 0) - previousBytes + size;
        let deviceBytes = (device?.bytes ?? 0) - previousBytes + size;
        const fits = () => count <= maxEntries && bytes <= maxBytes && deviceBytes <= DEVICE_BYTES;
        const evict: number[] = [];
        // The ordered query is newest first. Reclaim only this scope's unpinned entries, oldest first.
        for (const row of existingRows.reverse()) {
          if (fits()) break;
          if (row.pinned || row.entry === previous?.entry) continue;
          evict.push(row.entry);
          count--;
          bytes -= row.bytes;
          deviceBytes -= row.bytes;
        }
        assertGrant(guard);
        // Commit reconciliation even if this package cannot fit. Keep opt-in eviction all or nothing.
        if (!fits()) return { changes, entry: undefined };
        for (const id of evict) {
          assertGrant(guard);
          await remove(id, tx);
        }
        if (previous) await remove(previous.entry, tx);
        const { lastInsertRowId } = await tx.runAsync(`
          INSERT INTO expo_reading_packages_v2 (
            origin, account_id, session_id, locale, resource_key, course_id, revision,
            chapter_ids, validated_at, verified_at, verified_until, verified_cursor, reset_generation,
            asset_lease_expires_at, info, bytes, saved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, ...keys(scope), key, candidate.target.courseId, candidate.revision, chapters, candidate.validatedAt,
        candidate.validatedAt, Math.min(candidate.leaseExpiresAt, access.leaseExpiresAt),
        candidate.cursor, candidate.resetGeneration, candidate.assetLeaseExpiresAt, info, size, now());
        if (previous ? previous.pinned === 0 : candidate.pinned === false) {
          await tx.runAsync("INSERT INTO expo_reading_unpinned_v2 (entry) VALUES (?)", lastInsertRowId);
        }
        const parts = [candidate.body, ...candidate.assets.map(asset => asset.bytes)];
        for (const [part, bytes] of parts.entries()) {
          for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
            assertGrant(guard);
            await tx.runAsync("INSERT INTO expo_reading_parts_v2 (entry, part, chunk, data) VALUES (?, ?, ?, ?)",
              lastInsertRowId, part, offset / CHUNK_BYTES, bytes.slice(offset, offset + CHUNK_BYTES));
          }
        }
        assertGrant(guard);
        return { changes, entry: lastInsertRowId };
      });
      committedEntry = committed.entry;
      reconciled = committed.changes;
      assertGrant(guard);
      if (committedEntry === undefined) throw new OfflineReadingError("storage-full");
    } catch (error) {
      // If a native commit completed as the session changed, remove only this writer's row.
      const entryToRemove = committedEntry;
      if (entryToRemove !== undefined) await transaction(tx => remove(entryToRemove, tx)).catch(() => {});
      throw error;
    } finally {
      if (committedEntry !== undefined || reconciled) notifyOfflineReadingChanges();
    }
  }

  return {
    read,
    list,
    store,
    async recordVisit(scope: NativeOfflineScope, target: OfflineReadingTarget, visitId: string, guard: Guard) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(visitId)) return false;
      const key = readingKey(target);
      return transaction(async tx => {
        assertGrant(guard);
        const prior = await tx.getFirstAsync<{ newest_visit: string; prior_visit: string | null }>(
          `SELECT newest_visit, prior_visit FROM expo_reading_visits WHERE ${scopeFilter} AND resource_key = ?`, ...keys(scope), key,
        );
        if (prior?.newest_visit === visitId || prior?.prior_visit === visitId) return false;
        await tx.runAsync(`
          INSERT INTO expo_reading_visits (origin, account_id, session_id, locale, resource_key, newest_visit, prior_visit, opened_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (origin, account_id, session_id, locale, resource_key) DO UPDATE SET
            newest_visit = excluded.newest_visit, prior_visit = excluded.prior_visit, opened_at = excluded.opened_at
        `, ...keys(scope), key, visitId, prior?.newest_visit ?? null, now());
        await tx.runAsync(`
          DELETE FROM expo_reading_visits WHERE ${scopeFilter} AND resource_key IN (
            SELECT resource_key FROM expo_reading_visits WHERE ${scopeFilter} ORDER BY opened_at DESC, resource_key ASC LIMIT -1 OFFSET ?
          )
        `, ...keys(scope), ...keys(scope), visitLimit);
        assertGrant(guard);
        return prior !== null;
      });
    },
    async storage(scope: NativeOfflineScope, guard: Guard) {
      const { entries, authority } = await inspect(scope, guard);
      return {
        unavailableCount: unavailableRows(entries, authority, guard).length,
        count: entries.length,
        bytes: entries.reduce((sum, item) => sum + item.bytes, 0),
        pinnedCount: entries.filter(item => item.pinned).length,
        maxBytes: Math.min(authority?.readingPolicy?.maxBytes ?? READING_STORAGE_LIMIT, READING_STORAGE_LIMIT),
      };
    },
    async setPinned(scope: NativeOfflineScope, target: OfflineReadingTarget, pinned: boolean, guard: Guard) {
      const changed = await transaction(async tx => {
        assertGrant(guard);
        const current = await entry(tx, scope, target);
        const authority = await readOfflineReadingAuthority(tx, scope);
        if (!current || !authority || !readyEntry(authority, current, guard.verifiedUntil, now())) return false;
        assertGrant(guard);
        if (pinned) await tx.runAsync("DELETE FROM expo_reading_unpinned_v2 WHERE entry = ?", current.entry);
        else await tx.runAsync("INSERT OR IGNORE INTO expo_reading_unpinned_v2 (entry) VALUES (?)", current.entry);
        return true;
      });
      if (changed) notifyOfflineReadingChanges();
      return changed;
    },
    async clearDownloads(scope: NativeOfflineScope, guard: Guard) {
      const removed = await transaction(async tx => {
        assertGrant(guard);
        await retireOfflineReadingDownloads(tx, scope, () => assertGrant(guard));
        const total = await tx.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM expo_reading_packages_v2 WHERE ${scopeFilter}`, ...keys(scope),
        );
        await tx.runAsync(`DELETE FROM expo_reading_packages_v2 WHERE ${scopeFilter}`, ...keys(scope));
        await tx.runAsync(`DELETE FROM expo_reading_visits WHERE ${scopeFilter}`, ...keys(scope));
        assertGrant(guard);
        return total?.count ?? 0;
      });
      notifyOfflineReadingChanges();
      return removed;
    },
    async purgeUnavailable(scope: NativeOfflineScope, guard: Guard) {
      const changed = await transaction(async tx => {
        assertGrant(guard);
        const authority = await readOfflineReadingAuthority(tx, scope);
        const unavailable = unavailableRows(await rows(tx, scope), authority, guard);
        let removed = 0;
        for (const row of unavailable) {
          assertGrant(guard);
          removed += await remove(row.entry, tx);
        }
        assertGrant(guard);
        return removed;
      });
      if (changed) notifyOfflineReadingChanges();
      return changed;
    },
    async revalidationCandidates(scope: NativeOfflineScope, guard: Guard, limit: number, afterEntry?: number) {
      const { entries, authority } = await inspect(scope, guard);
      if (!authority || authority.pending) return [];
      const eligible = unavailableRows(entries, authority, guard).flatMap(row => {
        const target = entryTarget(row.resource_key);
        return target && proof(authority, target, now()) ? [{ target, entry: row.entry }] : [];
      }).sort((left, right) => right.entry - left.entry);
      if (afterEntry === undefined) return eligible.slice(0, limit);
      const older = eligible.filter(item => item.entry < afterEntry);
      return [...older, ...eligible.filter(item => item.entry >= afterEntry)].slice(0, limit);
    },
    async authorize(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard, requiredEntry?: number) {
      assertGrant(guard);
      await initialize();
      const existing = await savedVersion(db, scope, target);
      const authorities = await readOfflineReadingAuthorities(db, scope);
      const authority = authorities.find(item => item.locale === scope.locale)?.snapshot;
      assertGrant(guard);
      const access = authority?.readingPolicy && proof(authority, target, now());
      if (!access || Math.min(access.leaseExpiresAt, guard.verifiedUntil) <= now()
        || (requiredEntry !== undefined && existing?.entry !== requiredEntry)) return null;
      const requestVersion: OfflineReadingRequestVersion | null = existing?.revision === access.descriptor.revision ? {
        saved: existing,
        cursor: access.cursor,
        checkedAt: access.checkedAt,
        generation: access.resetGeneration,
      } : null;
      return { ...access, requestVersion, courseVersions: authorities.map(({ locale, revision }) => ({ locale, revision })),
        autoCache: authority?.readingPolicy?.autoCache === true, wifiOnly: authority?.readingPolicy?.wifiOnly !== false };
    },
    async captureCourseVersions(session: NativeSessionScope) {
      await initialize();
      return readOfflineReadingAuthorityVersions(db, session);
    },
    async applyAccessWithRestrictions(scope: NativeOfflineScope, page: OfflineMetadataAccessPage & { expectedRevision: number },
      restrictions: OfflineReadingRestrictions,
      versions: readonly OfflineReadingCourseVersion[], assertCurrent: () => void) {
      const revision = await transaction(async tx => {
        assertCurrent();
        const update = await prepareOfflineReadingAccess(tx, scope, page);
        if (!update || !await writeOfflineReadingSnapshot(tx, scope, update.revision, update.encoded)) return null;
        const removal: OfflineReadingRemoval = { denied: [], chapterLimits: new Map(), deleted: new Map(), omitted: new Map() };
        for (const grant of restrictions.grants) {
          if (grant.allowed) removal.chapterLimits.set(grant.courseId, grant.chapterIds);
          else removal.denied.push(grant.courseId);
        }
        for (const event of restrictions.deletions) {
          const prior = update.previous?.courses.find(course => course.courseId === event.courseId);
          const cursor = prior?.manifest?.cursor ?? update.previous?.cursor;
          const newer = update.previous?.readingValidation?.invalidations[event.key];
          if ((!cursor || compareNativeOfflineCursors(cursor, event.cursor) <= 0)
            && (!newer || compareNativeOfflineCursors(newer, event.cursor) <= 0)) removal.deleted.set(event.key, event.cursor);
        }
        await removeRestricted(tx, scope, removal);
        await restrictAlternate(tx, scope, restrictions, versions, assertCurrent);
        assertCurrent();
        return update.revision + 1;
      });
      if (revision !== null) notifyOfflineReadingChanges();
      return revision;
    },
    async commitPageWithManifests(scope: NativeOfflineScope, page: OfflineMetadataCompletePage,
      checks: readonly OfflineManifestCheck[], assertCurrent: () => void) {
      const changed = await transaction(async tx => {
        assertCurrent();
        const encoded = await prepareOfflineReadingPage(tx, scope, page);
        if (encoded === null || !await writeOfflineReadingSnapshot(tx, scope, page.accessRevision, encoded)) return false;
        const groups = new Map<string, { version: OfflineReadingCourseVersion; checks: OfflineManifestCheck[] }>();
        for (const check of checks) {
          for (const version of check.versions) {
            if (version.locale === scope.locale) continue;
            const key = JSON.stringify([version.locale, version.revision]);
            const group = groups.get(key) ?? { version, checks: [] };
            group.checks.push(check);
            groups.set(key, group);
          }
        }
        for (const { version, checks } of groups.values()) {
          await restrictAlternate(tx, scope, {
            grants: checks.map(check => check.reported.resource),
            deletions: [],
            manifestGrantCursors: new Map(checks.map(({ reported }) => [reported.resource.courseId, reported.cursor])),
            manifests: checks.filter(check => equivalentOfflineCourseAccess(check.accepted.resource, check.reported.resource))
              .map(check => check.reported),
          }, [version], assertCurrent);
        }
        await removeRestricted(tx, scope, {
          denied: [], deleted: new Map(),
          chapterLimits: new Map(checks.map(({ accepted }) => [accepted.resource.courseId, accepted.resource.chapterIds])),
          omitted: new Map(checks.map(({ accepted }) => [accepted.resource.courseId,
            { keys: new Set(accepted.resources.map(resource => resource.key)), cursor: accepted.cursor }])),
        });
        assertCurrent();
        return true;
      });
      if (changed) notifyOfflineReadingChanges();
      return changed;
    },
    async withdrawCourse(session: NativeSessionScope, courseId: string, versions: OfflineReadingCourseVersion[], assertCurrent: () => void) {
      const changed = await transaction(async tx => {
        assertCurrent();
        const changed = await withdrawCourses(tx, session, [courseId], versions, assertCurrent);
        assertCurrent();
        return changed;
      });
      if (changed) notifyOfflineReadingChanges();
    },
    async invalidate(scope: NativeOfflineScope, target: OfflineReadingTarget, version: OfflineReadingRequestVersion, guard: Guard) {
      const changed = await transaction(async tx => {
        assertGrant(guard);
        const authority = await readOfflineReadingAuthority(tx, scope);
        const access = authority && proof(authority, target, now());
        if (!access || access.resetGeneration !== version.generation || access.cursor !== version.cursor
          || access.checkedAt !== version.checkedAt || access.descriptor.revision !== version.saved.revision) return 0;
        const current = await savedVersion(tx, scope, target);
        const saved = version.saved;
        if (!current || current.entry !== saved.entry || current.revision !== saved.revision || current.verified_at !== saved.verified_at
          || current.verified_until !== saved.verified_until || current.verified_cursor !== saved.verified_cursor
          || current.reset_generation !== saved.reset_generation) return 0;
        assertGrant(guard);
        return remove(current.entry, tx);
      });
      if (changed) notifyOfflineReadingChanges();
    },
    async forget(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard) {
      const changed = await transaction(async tx => {
        assertGrant(guard);
        const current = await entry(tx, scope, target);
        assertGrant(guard);
        return current ? await remove(current.entry, tx) : 0;
      });
      if (changed) notifyOfflineReadingChanges();
      return Boolean(changed);
    },
    async reconcile(scope: NativeOfflineScope, assertCurrent: () => void) {
      const changed = await transaction(async tx => {
        assertCurrent();
        const authority = await readOfflineReadingAuthority(tx, scope);
        const changes = authority ? await reconcileScope(tx, scope, authority) : 0;
        assertCurrent();
        return changes;
      });
      if (changed) notifyOfflineReadingChanges();
    },
    async clearSession({ origin, accountId, sessionId }: NativeSessionScope) {
      await transaction(async tx => {
        await tx.runAsync("DELETE FROM expo_reading_packages_v2 WHERE origin = ? AND account_id = ? AND session_id = ?", origin, accountId, sessionId);
        await tx.runAsync("DELETE FROM expo_reading_visits WHERE origin = ? AND account_id = ? AND session_id = ?", origin, accountId, sessionId);
      });
      notifyOfflineReadingChanges();
    },
  };
}

export type NativeOfflineReadingStore = ReturnType<typeof createOfflineReadingStore>;
